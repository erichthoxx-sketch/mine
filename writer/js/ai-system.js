// Единый контекст четырёх приложений, без паролей, токенов и личных контактов.
// Снимки отправляются только по явному нажатию в Мастерской.
const n = (v) => Number.isFinite(Number(v)) ? Number(v) : 0;
const pick = (x, keys) => Object.fromEntries(keys.filter((k) => x && x[k] != null).map((k) => [k, x[k]]));
const dayKey = (v) => String(v || '').slice(0, 10);
const monthKey = (v) => dayKey(v).slice(0, 7);
const text = (v, max = 5000) => String(v || '').slice(0, max);
const sum = (rows, key) => Math.round(rows.reduce((acc, r) => acc + n(r[key]), 0) * 100) / 100;
function byMonth(rows) {
  const result = new Map();
  for (const r of rows) {
    const k = monthKey(r.date);
    if (!/^\d{4}-\d{2}$/.test(k)) continue;
    const v = result.get(k) || { month: k, quantity: 0, royalty: 0 };
    v.quantity += n(r.qty); v.royalty += n(r.royalty); result.set(k, v);
  }
  return [...result.values()].sort((a, b) => a.month.localeCompare(b.month)).map((v) => ({ ...v, royalty: Math.round(v.royalty * 100) / 100 }));
}
export function marketingSnapshot(data, generatedAt = new Date().toISOString()) {
  const books = (data.w_books || []).map((b) => ({
    id: b.id, title: b.title, status: b.status, genres: Array.isArray(b.genres) ? b.genres : [],
    tags: Array.isArray(b.tags) ? b.tags : [],
    promo: pick(b.promo, ['annotation', 'short', 'tags', 'quotes']),
    direct: { ads: (b.direct?.ads || []).slice(0, 30).map((a) => pick(a, ['h1', 'h2', 'text', 'status'])) },
    platforms: b.platforms || [], release: b.publishStart || null,
  }));
  const ideas = (data.w_ideas || []).slice(0, 300).map((x) => ({
    bookId: x.bookId || null, status: x.status, title: text(x.title, 180), text: text(x.text, 4000),
    tags: Array.isArray(x.tags) ? x.tags : [],
  }));
  const contests = (data.w_contests || []).slice(0, 100).map((x) => ({
    name: x.name, platform: x.platform, end: x.end, status: x.status,
    genres: x.genres, bookIds: x.bookIds, conditions: text(x.conditions, 1000)
  }));
  const reviews = (data.w_reviews || []).slice(0, 200).map((x) => ({
    bookId: x.bookId || null, source: x.source, date: x.date, text: text(x.text, 6000)
  }));
  const promos = (data.w_promolinks || []).slice(0, 200).map((x) => pick(x,
    ['bookId', 'channel', 'campaign', 'status', 'createdAt', 'start', 'end', 'clicks', 'notes']));
  const blogs = (data.w_blog || []).slice(0, 100).map((x) => ({
    bookId: x.bookId || null, title: text(x.title, 200), status: x.status,
    modifiedAt: x.modifiedAt, text: text(x.html, 6000).replace(/<[^>]*>/g, ' ').replace(/\\s+/g, ' ').trim()
  }));
  return { section: 'marketing', generatedAt, note: 'Только маркетинговые сведения. Без контактов, ключей и финансовых настроек.', books, ideas, contests, reviews, promos, blogs };
}
export function incomeSnapshot(data, generatedAt = new Date().toISOString()) {
  const sales = (data.sales || []).map((x) => pick(x, ['date', 'book', 'bookId', 'kind', 'price', 'qty', 'royalty']))
    .filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x.date || ''))
    .sort((a, b) => (b.date || '').localeCompare(a.date || '')).slice(0, 5000);
  const campaigns = (data.campaigns || []).slice(0, 200).map((x) => pick(x, ['id', 'name', 'bookId', 'book', 'channel', 'start', 'end', 'budget', 'spent', 'status']));
  const reports = (data.reports || []).slice(0, 1500).map((x) => pick(x, ['date', 'from', 'to', 'start', 'end', 'campaignId', 'cid', 'spend', 'cost', 'spent', 'name', 'clicks', 'impressions', 'orders', 'sales', 'source']));
  return { section: 'income', generatedAt, note: 'Дата последней выгрузки определяет свежесть продаж. Валюта: RUB. Персональные и налоговые реквизиты не передаются.',
    lastSaleDate: sales[0]?.date || null,
    books: (data.books || []).slice(0, 200).map((x) => pick(x, ['id', 'title', 'name', 'status'])),
    totals: { salesRows: sales.length, quantity: sum(sales, 'qty'), royalty: sum(sales, 'royalty') },
    months: byMonth(sales),
    sales, campaigns, reports };
}
export function directSnapshot(docs, generatedAt = new Date().toISOString()) {
  const main = docs?.main || {}, stats = docs?.stats || {}, mk = docs?.mk || {};
  const campaigns = (main.campaigns || []).slice(0, 200).map((x) => pick(x, ['id', 'name', 'state', 'status', 'type', 'start', 'daily', 'budget', 'strategy', 'counters']));
  const daily = (stats.daily || []).slice(-4000).map((x) => pick(x, ['date', 'cid', 'impr', 'clicks', 'cost', 'conversions', 'orders']));
  const queries = (stats.queries || []).slice(0, 250).map((x) => pick(x, ['cid', 'query', 'text', 'phrase', 'clicks', 'impr', 'cost', 'conversions']));
  const keywords = (main.keywords || []).slice(0, 300).map((x) => pick(x, ['id', 'cid', 'text', 'kw', 'bid', 'status', 'state']));
  const adDaily = (stats.adDaily || []).slice(-2000).map((x) => pick(x, ['date', 'cid', 'aid', 'net', 'impr', 'clicks', 'cost']));
  return { section: 'direct', generatedAt, note: 'Сохранённый снимок статистики Яндекс.Директа из приложения; не является запросом в рекламный кабинет в реальном времени. Ключи и параметры доступа не включены.',
    snapshotAt: main.syncedAt || main.at || stats.at || null, campaigns, daily, keywords, queries, adDaily,
    metrika: { daily: (mk.daily || []).slice(-100).map((x) => pick(x, ['key', 'visits', 'bounce', 'goals'])),
      sources: (mk.sources || []).slice(0, 40).map((x) => pick(x, ['source', 'visits', 'goals'])) } };
}
// Прямое чтение только d_snap. В саму базу и рекламный кабинет ничего не записываем.
export async function readDirectDocs(store) {
  if (store.mode !== 'firebase' || !store.user?.uid || !store.db || !store.F) {
    throw Error('Нет входа Firebase для получения статистики Директа');
  }
  const { collection, getDocsFromServer } = store.F;
  const result = await getDocsFromServer(collection(store.db, 'users', store.user.uid, 'd_snap'));
  const docs = Object.fromEntries(result.docs.map((d) => [d.id, d.data()]));
  return { main: docs.main || {}, stats: docs.stats || {}, mk: docs.mk || {} };
}
