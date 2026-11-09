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
export async function loadPublic(prevImgs = {}) {
  if (LOCAL) return loadLocal();
  // тексты — отдельно и первыми: картинки (почти мегабайт) не должны мешать свежим текстам показаться
  // (раньше сбой загрузки картинок оставлял на экране старые тексты из памяти браузера)
  const r = await fetch(`${BASE}/site/main?key=${firebaseConfig.apiKey}&_=${Date.now()}`, { cache: 'no-store' });
  if (r.status === 404) return { content: null, imgs: {} };
  if (!r.ok) throw new Error('site ' + r.status);
  const doc = await r.json();
  const content = JSON.parse(doc.fields?.json?.stringValue || 'null');
  let imgs = {};
  try {
    let token = '';
    do {
      const q = await fetch(`${BASE}/site_img?pageSize=20&key=${firebaseConfig.apiKey}${token ? '&pageToken=' + encodeURIComponent(token) : ''}`);
      if (!q.ok) throw new Error('img ' + q.status);
      const j = await q.json();
      for (const d of j.documents || []) imgs[d.name.split('/').pop()] = d.fields?.data?.stringValue || '';
      token = j.nextPageToken || '';
    } while (token);
  } catch { imgs = { ...prevImgs, ...imgs }; } // картинки не загрузились — берём сохранённые, тексты всё равно свежие
  return { content, imgs };
}

// Подписка: посетитель оставляет почту (на localhost — в этом браузере)
export async function addSub(email, src, name = '') {
  const at = new Date().toISOString();
  if (LOCAL) {
    const list = JSON.parse(localStorage.getItem('lanaSite.subs') || '[]');
    list.push({ email, at, src, consent: true, ...(name ? { name } : {}) });
    localStorage.setItem('lanaSite.subs', JSON.stringify(list));
    return;
  }
  const send = (withName) => fetch(`${BASE}/site_subs?key=${firebaseConfig.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { email: { stringValue: email }, at: { stringValue: at }, src: { stringValue: src }, consent: { booleanValue: true }, ...(withName ? { name: { stringValue: name.slice(0, 79) } } : {}) } }),
  });
  let r = await send(!!name);
  // старые правила Firebase ещё не знают про имя — почту всё равно сохраняем
  if (!r.ok && name) r = await send(false);
  if (!r.ok) throw new Error('sub ' + r.status);
}

// Подписка через свой сервис писем (адрес в админке → «Письма»): сервис шлёт письмо «Подтвердите подписку».
// Пока сервиса нет — почта, как раньше, в Firebase. Ответ: { confirm: true } — ждём подтверждения из письма.
export async function subscribe(c, email, src, name = '') {
  const url = String(c?.mailUrl || '').trim();
  if (!url) { await addSub(email, src, name); return { confirm: false }; }
  const r = await fetch(`${url}${url.includes('?') ? '&' : '?'}a=sub`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, ok: true, src, name: String(name || '').slice(0, 79) }),
  });
  if (!r.ok) throw new Error('mail ' + r.status);
  const j = await r.json().catch(() => ({}));
  return { confirm: !j.already };
}
