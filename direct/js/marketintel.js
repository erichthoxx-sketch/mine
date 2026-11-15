// Международная книжная разведка: публичные RSS-ленты и проверенные точки наблюдения.
// Не используем Reddit API без одобрения и не обходим защиту Amazon.
// Загрузка только при открытом «Директе»: без фонового сервера и платных сервисов.
const FEEDS = [
  { id: 'bookriot', name: 'Book Riot', region: 'США', lang: 'EN', type: 'Редакторские новости и культура чтения', url: 'https://bookriot.com/feed/' },
  { id: 'perspectives', name: 'Publishing Perspectives', region: 'Мир', lang: 'EN', type: 'Издательский рынок, права, дистрибуция', url: 'https://publishingperspectives.com/feed/' },
  { id: 'gnews-romance', name: 'Новости · romance / BookTok', region: 'Мир', lang: 'EN', type: 'Поиск новостей', url: 'https://news.google.com/rss/search?q=romance%20books%20BookTok%20publishing&hl=en-US&gl=US&ceid=US%3Aen' },
];

export const MARKET_INTEL_SOURCES = Object.freeze([
  { group: 'Издательская индустрия', name: 'Publishing Perspectives', url: 'https://publishingperspectives.com/', note: 'Новости издательств, права, мировые рынки', mode: 'новости' },
  { group: 'Издательская индустрия', name: 'The Bookseller', url: 'https://www.thebookseller.com/', note: 'Британский рынок, продажи и тренды', mode: 'публичные материалы' },
  { group: 'Издательская индустрия', name: 'Publishers Weekly', url: 'https://www.publishersweekly.com/', note: 'Издательская индустрия США и сделки', mode: 'публичные материалы' },
  { group: 'Издательская индустрия', name: 'Book Riot', url: 'https://bookriot.com/', note: 'Читательские привычки, медиа, жанры', mode: 'новости' },
  { group: 'Международные продажи', name: 'Amazon · Kindle Romance', url: 'https://www.amazon.com/Best-Sellers-Kindle-Store-Romance-eBooks/zgbs/digital-text/158566011', note: 'Публичный рейтинг; НЕ реальные цифры продаж', mode: 'открыть' },
  { group: 'Международные продажи', name: 'KDPTop · Kindle Romance', url: 'https://kdptop.com/kdp/categories/romance-158566011/', note: 'Сводка Amazon, цены и ротация топа; сторонний источник', mode: 'открыть' },
  { group: 'Международные продажи', name: 'BookWriter · Kindle Romance', url: 'https://www.bookwriter.vip/tools/amazon-bestseller-tracker/kindle-romance', note: 'История мест в Amazon; сторонний мониторинг', mode: 'открыть' },
  { group: 'Международные продажи', name: 'Kobo · новости и отчеты', url: 'https://www.kobo.com/news/', note: 'Официальные публичные отчеты о чтении', mode: 'открыть' },
  { group: 'Голос читательниц', name: 'Reddit · RomanceBooks', url: 'https://www.reddit.com/r/RomanceBooks/', note: 'Запросы читательниц и обсуждения; API-доступ не подключен', mode: 'ссылка' },
  { group: 'Голос читательниц', name: 'Reddit · DarkRomance', url: 'https://www.reddit.com/r/DarkRomance/', note: 'Тропы, чувствительные темы, отзывы; API-доступ не подключен', mode: 'ссылка' },
  { group: 'Голос читательниц', name: 'Reddit · fantasyromance', url: 'https://www.reddit.com/r/fantasyromance/', note: 'Романтическое фэнтези и смежные аудитории', mode: 'ссылка' },
  { group: 'Россия', name: 'Литнет · топы', url: 'https://litnet.com/ru/top/lyubovnye-romany', note: 'Наблюдаемые карточки топа, автоматически отдельно ниже', mode: 'в приложении' },
  { group: 'Россия', name: 'ЛитРес', url: 'https://www.litres.ru/', note: 'Карточки, цены, жанровые рейтинги; пока без сборщика', mode: 'ссылка' },
  { group: 'Россия', name: 'Author.Today', url: 'https://author.today/', note: 'Каталог, новинки, жанры; пока без сборщика', mode: 'ссылка' },
]);

export const MARKET_INTEL_FEEDS = FEEDS;
const relevant = /\b(romance|romantasy|dark romance|sports romance|contemporary romance|romantic suspense|young adult|new adult|booktok|bookstagram|book publishing|book industry|publishing|publisher|self.publishing|indie author|ebook|audiobook|book sales|book market|readers|fiction|bestseller|kindle|kobo|rights|translation)\b|любовн|роман|самиздат|издатель|книг|читател|аудиокниг|подписк|продаж|тр(о|ё)п/i;
export const relevance = (entry) => relevant.test((entry.title || '') + ' ' + (entry.description || ''));
const decode = (v) => String(v || '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>');
const clean = (s) => decode(String(s || '').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 260);
const safeLink = (s) => { try { const u = new URL(decode(String(s || '').trim())); return u.protocol === 'https:' || u.protocol === 'http:' ? u.href : ''; } catch { return ''; } };
const dateOf = (s) => { const t = Date.parse(String(s || '')); return Number.isFinite(t) ? new Date(t).toISOString() : null; };

// Reader может вернуть исходный RSS/XML либо преобразованный Markdown.
export function parsePublicFeed(text, source, max = 22) {
  const raw = String(text || '');
  if (typeof DOMParser !== 'undefined' && /<(?:rss|feed|item|entry)[\s>]/i.test(raw)) {
    const doc = new DOMParser().parseFromString(raw, 'text/xml');
    if (!doc.querySelector('parsererror')) {
      const nodes = [...doc.querySelectorAll('item, entry')];
      const found = nodes.map((node) => {
        const attrLink = [...node.querySelectorAll('link')].map((el) => el.getAttribute('href') || el.textContent).find(Boolean);
        const url = safeLink(attrLink);
        return { title: clean(node.querySelector('title')?.textContent), url, date: dateOf(node.querySelector('pubDate, published, updated, dc\\:date')?.textContent),
          description: clean(node.querySelector('description, summary')?.textContent), source: source.name, sourceId: source.id, lang: source.lang };
      }).filter((x) => x.url && x.title && relevance(x));
      if (found.length) return found.slice(0, max);
    }
  }
  // Jina Reader часто извлекает ссылки как Markdown; не принимаем меню/рекламу за новость.
  const host = new URL(source.url).hostname.replace(/^www\./, '');
  const lines = raw.split('\n'), out = [], seen = new Set();
  for (const line of lines) {
    const re = /\[([^\]\n]{18,180})\]\((https?:\/\/[^)\s]+)\)/g;
    let m;
    while ((m = re.exec(line))) {
      const url = safeLink(m[2]), title = clean(m[1]);
      if (!url || !title || !relevance({ title, source: source.name })) continue;
      let site;
      try { site = new URL(url).hostname.replace(/^www\./, ''); } catch { continue; }
      if (!(site === host || site.endsWith('.' + host) || (host === 'news.google.com' && site === 'news.google.com'))) continue;
      if (/\/(tag|category|author|about|subscribe|privacy|terms|search)\b/i.test(new URL(url).pathname)) continue;
      if (!seen.has(url)) { seen.add(url); out.push({ title, url, date: null, description: '', source: source.name, sourceId: source.id, lang: source.lang }); }
      if (out.length >= max) return out;
    }
  }
  return out;
}
export function distinctNews(items = [], limit = 60) {
  const seen = new Set();
  return items.filter((x) => {
    const key = (x.url || '').split('?')[0];
    if (!key || seen.has(key)) return false; seen.add(key); return true;
  }).sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, limit);
}
