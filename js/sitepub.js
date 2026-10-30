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
    return { id: b.id, title: plainTitle(b.title), status: b.status || '', hidden: !!b.hidden, series: b.series || '', url, page: SITE_URL + '?kniga=' + url, litnet: b.litnet || '', startDate: b.startDate || '', startPrice: b.startPrice || '', price: b.price || '' };
  });
  return { books, subOn: content.subOn !== false, giftName: content.giftName || '', giftUrl: content.giftUrl || '', metrika: content.metrika ?? '113843691', raffleOn: !!content.raffleOn && Number(content.rafStock) > 0, raffleLast: content.raffleLast || '' };
}

export async function loadSite() {
  const r = await fetch(`${BASE}/site/main?key=${firebaseConfig.apiKey}`);
  if (r.status === 404) return null;
  if (!r.ok) throw new Error('site ' + r.status);
  const doc = await r.json();
  return siteInfo(JSON.parse(doc.fields?.json?.stringValue || 'null'));
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
