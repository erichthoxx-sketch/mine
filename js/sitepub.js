// Сайт автора (lanafreitag.ru) для «Директа» и «Мастерской»: книги и настройки сайта, подписчики.
// Сайт лежит в том же Firebase: site/main читает любой, site_subs — только владелица (по её входу).
// Код сайта (site/) сюда не подключаем: приложения и сайт публикуются отдельно.
import { firebaseConfig } from './firebase-config.js';

export const SITE_URL = 'https://lanafreitag.ru/';
export const SITE_ADMIN = 'https://lanafreitag.ru/admin/';
const BASE = `https://firestore.googleapis.com/v1/projects/${firebaseConfig.projectId}/databases/(default)/documents`;

// Адрес страницы книги — как на самом сайте (site/content.js → slugify)
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
export const slugify = (s) => String(s ?? '').toLowerCase().replace(/[а-яё]/g, (ch) => TR[ch] ?? '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
export const plainTitle = (t) => String(t || '').replace(/\*/g, '').replace(/\s+/g, ' ').trim();
// сравнение названий книг: без регистра, «ё», кавычек и знаков
export const sameTitle = (a, b) => { const k = (x) => plainTitle(x).toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ''); return !!k(a) && k(a) === k(b); };

// Содержимое сайта → то, что нужно приложениям
export function siteInfo(content) {
  if (!content || typeof content !== 'object') return null;
  const taken = new Set();
  const books = (Array.isArray(content.books) ? content.books : []).filter((b) => b && b.id).map((b) => {
    let url = slugify(b.slug) || slugify(plainTitle(b.title)) || b.id;
    if (taken.has(url)) url += '-' + b.id.slice(-4);
    taken.add(url);
    return { id: b.id, title: plainTitle(b.title), status: b.status || '', hidden: !!b.hidden, series: b.series || '', seriesNo: Number(b.seriesNo) || null, url, page: SITE_URL + '?kniga=' + url, litnet: b.litnet || '', ann: !!String(b.ann || '').trim(), tagline: !!String(b.tagline || '').trim(), frag: String(b.frag || '').length, startDate: b.startDate || '', startPrice: b.startPrice || '', price: b.price || '' };
  });
  return { books, subOn: content.subOn !== false, giftName: content.giftName || '', giftUrl: content.giftUrl || '', metrika: content.metrika ?? '113843691', raffleOn: content.cabOn === true && !!content.raffleOn && Number(content.rafStock) > 0, raffleLast: content.raffleLast || '', utm: content.utm ?? 'utm_source=lanafreitag.ru&utm_medium=site', utmAt: content.utmAt || '' };
}

export async function loadSite() {
  const r = await fetch(`${BASE}/site/main?key=${firebaseConfig.apiKey}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('site ' + r.status);
  const doc = await r.json();
  return siteInfo(JSON.parse(doc.fields?.json?.stringValue || 'null'));
}

// Всё содержимое сайта как есть — чтобы «Мастерская» могла обновить у книги аннотацию, крючок, фрагмент
const LOCAL = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export async function loadSiteRaw() {
  if (LOCAL) { try { return JSON.parse(localStorage.getItem('lanaSite.v1') || 'null')?.content || null; } catch { return null; } }
  const r = await fetch(`${BASE}/site/main?key=${firebaseConfig.apiKey}`, { cache: 'no-store' });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('site ' + r.status);
  return JSON.parse((await r.json()).fields?.json?.stringValue || 'null');
}
// Обновить книгу сайта (найдена по названию) — записывает владелица своим входом (правила: site/* меняет только она)
export async function patchSiteBook(title, patch, idToken) {
  const c = await loadSiteRaw();
  const b = c?.books?.find((x) => sameTitle(x.title, title));
  if (!b) throw new Error('На сайте нет книги «' + plainTitle(title) + '»');
  Object.assign(b, patch);
  if (LOCAL) { const d = JSON.parse(localStorage.getItem('lanaSite.v1') || '{}'); d.content = c; localStorage.setItem('lanaSite.v1', JSON.stringify(d)); return b; }
  const r = await fetch(`${BASE}/site/main?updateMask.fieldPaths=json&updateMask.fieldPaths=at`, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(c) }, at: { stringValue: new Date().toISOString() } } }),
  });
  if (!r.ok) throw new Error(r.status === 403 ? 'Сайт закреплён за другим входом' : 'Не получилось записать на сайт (' + r.status + ')');
  return b;
}

// Подписчики сайта — нужен вход владелицы (токен Firebase)
export async function loadSubs(idToken) {
  const out = [];
  let token = '';
  do {
    const r = await fetch(`${BASE}/site_subs?pageSize=300${token ? '&pageToken=' + encodeURIComponent(token) : ''}`, { headers: { Authorization: 'Bearer ' + idToken } });
    if (!r.ok) throw new Error('subs ' + r.status);
    const j = await r.json();
    for (const d of j.documents || []) out.push({ email: d.fields?.email?.stringValue || '', at: d.fields?.at?.stringValue || '', src: d.fields?.src?.stringValue || '' });
    token = j.nextPageToken || '';
  } while (token);
  return out;
}

// Картинка сайта (обложка) — для письма; читать может любой
export async function siteImg(id) {
  if (!id) return '';
  if (LOCAL) { try { return JSON.parse(localStorage.getItem('lanaSite.v1') || 'null')?.imgs?.[id] || ''; } catch { return ''; } }
  const r = await fetch(`${BASE}/site_img/${encodeURIComponent(id)}?key=${firebaseConfig.apiKey}`);
  return r.ok ? (await r.json()).fields?.data?.stringValue || '' : '';
}
// Поменять настройки сайта верхнего уровня (оформление писем letter, адрес сервиса mailUrl) — вход владелицы
export async function patchSite(patch, idToken) {
  const c = await loadSiteRaw();
  if (!c) throw new Error('Сайт ещё не настроен в админке');
  Object.assign(c, patch);
  if (LOCAL) { const d = JSON.parse(localStorage.getItem('lanaSite.v1') || '{}'); d.content = c; localStorage.setItem('lanaSite.v1', JSON.stringify(d)); return c; }
  const r = await fetch(`${BASE}/site/main?updateMask.fieldPaths=json&updateMask.fieldPaths=at`, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(c) }, at: { stringValue: new Date().toISOString() } } }),
  });
  if (!r.ok) throw new Error(r.status === 403 ? 'Сайт закреплён за другим входом' : 'Не получилось записать на сайт (' + r.status + ')');
  return c;
}

// Почта: пароль сервиса писем, черновик письма, адреса обложек — в её личных данных users/{uid}/meta/sitemail
// (тот же документ, что у админки сайта; на localhost — в этом браузере, как у пробной админки)
export async function loadMailCfg(uid, idToken) {
  if (LOCAL || !uid) { try { return JSON.parse(localStorage.getItem('lanaSite.mail') || '{}'); } catch { return {}; } }
  const r = await fetch(`${BASE}/users/${uid}/meta/sitemail`, { headers: { Authorization: 'Bearer ' + idToken } });
  if (r.status === 404) return {};
  if (!r.ok) throw new Error('mailcfg ' + r.status);
  return JSON.parse((await r.json()).fields?.json?.stringValue || '{}');
}
export async function saveMailCfg(uid, idToken, cfg) {
  if (LOCAL || !uid) { localStorage.setItem('lanaSite.mail', JSON.stringify(cfg)); return; }
  const r = await fetch(`${BASE}/users/${uid}/meta/sitemail`, {
    method: 'PATCH', headers: { Authorization: 'Bearer ' + idToken, 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: { json: { stringValue: JSON.stringify(cfg) }, at: { stringValue: new Date().toISOString() } } }),
  });
  if (!r.ok) throw new Error('mailcfg ' + r.status);
}
// Сервис писем (функция Yandex Cloud): admin-запрос с паролем
export async function mailCall(url, key, body) {
  const u = String(url || '').trim();
  if (!u) throw Object.assign(new Error('Сервис писем не подключён'), { why: 'nourl' });
  const r = await fetch(`${u}${u.includes('?') ? '&' : '?'}a=admin`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: key || '', ...body }) });
  const j = await r.json().catch(() => ({}));
  if (r.status === 403) throw Object.assign(new Error('Пароль сервиса не подходит'), { why: 'key' });
  if (!r.ok) throw Object.assign(new Error(j.error || 'Сервис писем не отвечает (' + r.status + ')'), { why: 'net' });
  return j;
}
