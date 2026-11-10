// Страницы сайта для поисковиков (10.11.2026, владелица: «чтобы сайт по моему имени и книгам выходил на первых страницах»).
// Запускается при публикации lanafreitag.ru (workflow в хранилище lanafreitag, после «Сборки»): node src/scripts/site-seo.mjs out
// Сайт рисуется в браузере из Firestore — поисковик видел почти пустую страницу. Здесь то же содержимое собирается заранее:
//  • главная — готовый текст внутри index.html, заголовок, описание, разметка «Автор» (schema.org Person);
//  • у каждой книги — своя страница /kniga/<адрес>/ с заголовком «Книга — Лана Фрейтаг, читать онлайн», описанием и разметкой «Книга»;
//  • sitemap.xml и robots.txt.
// Браузер потом рисует страницу как обычно (site.js), внешне ничего не меняется. Ссылки ./?kniga= продолжают работать.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { normalize, renderSite, renderBook, renderPrivacy, findBook, esc, genreOf, bookLinks, safeUrl } from '../site/content.js';

const OUT = process.argv[2] || 'out';
const ORIGIN = 'https://lanafreitag.ru';
const DOC = 'https://firestore.googleapis.com/v1/projects/dohody-6d6dd/databases/(default)/documents/site/main';

const plain = (s) => String(s ?? '').replace(/<[^>]+>/g, ' ').replace(/[*_#>]/g, '').replace(/\s+/g, ' ').trim();
const cut = (s, n = 160) => { const t = plain(s); return t.length <= n ? t : t.slice(0, n - 1).replace(/\s+\S*$/, '') + '…'; };
const T = (b) => plain(String(b.title || '').replace(/\*/g, ''));
const bookPath = (b) => `/kniga/${encodeURIComponent(b.url || b.id)}/`;

// ссылки на книги — «настоящие» адреса /kniga/…/ (для поисковика); в браузере site.js понимает оба вида
export const seoLinks = (html) => String(html).replace(/href="\.\/\?kniga=([^"&#]+)"/g, (_, k) => `href="/kniga/${k}/"`);

export function pageHtml(shell, { title, description, canonical, jsonld, r, isBook = false, image = '' }) {
  const meta = [
    `<title>${esc(title)}</title>`,
    `<meta name="description" content="${esc(description)}">`,
    `<link rel="canonical" href="${esc(canonical)}">`,
    `<meta property="og:type" content="${isBook ? 'book' : 'website'}">`,
    `<meta property="og:title" content="${esc(title)}">`,
    `<meta property="og:description" content="${esc(description)}">`,
    `<meta property="og:url" content="${esc(canonical)}">`,
    `<meta property="og:site_name" content="Лана Фрейтаг">`,
    `<meta property="og:locale" content="ru_RU">`,
    image ? `<meta property="og:image" content="${esc(image)}">` : '',
    `<script type="application/ld+json">${JSON.stringify(jsonld).replace(/</g, '\\u003c')}</script>`,
  ].filter(Boolean).join('\n');
  let h = shell
    .replace(/<title>[\s\S]*?<\/title>\s*/, '')
    .replace(/<meta name="description"[^>]*>\s*/, '')
    .replace('</head>', meta + '\n</head>')
    .replace('<header class="top" id="head"></header>', `<header class="top" id="head">${seoLinks(r.head)}</header>`)
    .replace('<main id="top"></main>', `<main id="top">${seoLinks(r.main)}</main>`)
    .replace('<footer class="foot" id="foot"></footer>', `<footer class="foot" id="foot">${seoLinks(r.foot)}</footer>`);
  if (r.colors) h = h.replace('<html lang="ru">', `<html lang="ru" style="--a1:${r.colors.a1};--a2:${r.colors.a2}">`);
  if (isBook) h = h.replace('<body>', '<body class="is-book">');
  return h;
}

export function buildSeo(raw, shell, { origin = ORIGIN, today = new Date().toISOString().slice(0, 10) } = {}) {
  const c = normalize(raw), name = c.name || 'Лана Фрейтаг', files = {};
  const books = c.books.filter((b) => !b.hidden && findBook(c, b.url || b.id));
  const person = { '@type': 'Person', name, url: origin + '/', jobTitle: 'Писательница', description: cut(`${name} — любовные романы: ${books.map(T).join(', ')}.`, 300),
    sameAs: [...new Set(books.flatMap((b) => bookLinks(b).map((x) => safeUrl(x.url)).filter((u) => /litnet\.com\/\w+\/[\w-]+-u\d+/.test(u))))] };
  // главная: в <base> не нуждается — пути и так от корня
  const home = renderSite(c, {});
  const homeDesc = cut(`${name} — любовные романы: ${books.map((b) => `«${T(b)}»`).join(', ')}. Читать онлайн на Литнете, новости о новых книгах.`);
  files['index.html'] = pageHtml(shell, { title: `${name} — любовные романы, читать онлайн`, description: homeDesc, canonical: origin + '/',
    jsonld: { '@context': 'https://schema.org', '@graph': [{ '@type': 'WebSite', name, url: origin + '/', inLanguage: 'ru' }, person] }, r: home, image: origin + '/hero-bear.jpg' });
  // страницы книг: от корня через <base href="/">, чтобы site.css, site.js и картинки нашлись из /kniga/…/
  const bookShell = shell.replace('<head>', '<head>\n<base href="/">');
  const urls = [{ loc: origin + '/', pri: '1.0' }];
  for (const b of books) {
    const r = renderBook(c, {}, b.url || b.id);
    if (!r) continue;
    const g = genreOf(b), litnet = bookLinks(b).map((x) => safeUrl(x.url)).filter(Boolean);
    const desc = cut(b.tagline ? `${b.tagline} ${plain(b.ann)}` : plain(b.ann) || `${T(b)} — ${g.join(', ').toLowerCase() || 'любовный роман'}. Автор — ${name}.`);
    const path = bookPath(b);
    files[path.slice(1) + 'index.html'] = pageHtml(bookShell, {
      title: `${T(b)} — ${name}${g[0] ? `, ${g[0].toLowerCase()}` : ''}, читать онлайн`, description: desc, canonical: origin + path, isBook: true, r,
      jsonld: { '@context': 'https://schema.org', '@type': 'Book', name: T(b), url: origin + path, inLanguage: 'ru', author: person,
        ...(g.length ? { genre: g } : {}), ...(plain(b.ann) ? { description: cut(b.ann, 500) } : {}), ...(litnet.length ? { sameAs: litnet } : {}),
        ...(b.series ? { isPartOf: { '@type': 'BookSeries', name: b.series } } : {}), ...(b.age ? { typicalAgeRange: String(b.age).replace(/\D/g, '') + '-' } : {}) },
    });
    urls.push({ loc: origin + path, pri: '0.9' });
  }
  if (renderPrivacy(c, {})) urls.push({ loc: origin + '/?privacy', pri: '0.2' });
  files['sitemap.xml'] = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map((u) => `  <url><loc>${esc(u.loc)}</loc><lastmod>${today}</lastmod><priority>${u.pri}</priority></url>`).join('\n')}\n</urlset>\n`;
  files['robots.txt'] = `User-agent: *\nDisallow: /admin/\nDisallow: /*?preview\nDisallow: /*?kabinet\n\nSitemap: ${origin}/sitemap.xml\n`;
  return files;
}

// запуск из workflow
if (import.meta.url === `file://${process.argv[1]}`) {
  const r = await fetch(DOC);
  if (!r.ok) { console.error('Firestore не ответил', r.status, '— страницы для поисковиков не собраны, сайт выложится как обычно'); process.exit(0); }
  const raw = JSON.parse((await r.json()).fields?.json?.stringValue || 'null');
  if (!raw) { console.error('Пустое содержимое сайта'); process.exit(0); }
  const files = buildSeo(raw, readFileSync(`${OUT}/index.html`, 'utf8'));
  for (const [p, body] of Object.entries(files)) { const f = `${OUT}/${p}`; mkdirSync(f.replace(/\/[^/]*$/, ''), { recursive: true }); writeFileSync(f, body); }
  console.log('Страницы для поисковиков:', Object.keys(files).join(', '));
}
