// Личный read-only MCP для книг «Мастерской». Отдельный Worker, «Директ» не затрагивает.
// Хранилище: Cloudflare KV binding BOOKS; секрет MCP_READ_KEY задаётся только в Cloudflare.
// Публикация книги — только из авторизованной Мастерской по Firebase ID token.
// Никаких публичных рукописей, анонимных MCP-вызовов и инструментов записи для нейросети.
// Директ вживую — только методы get и отчёты (get_direct_live), ключ Директа нейросети не отдаётся.
const ORIGINS = new Set(['https://erichthoxx-sketch.github.io', 'http://localhost:8765']);
const PROJECT = 'dohody-6d6dd';
const MAX_BYTES = 6 * 1024 * 1024;
let keysCache = null, keysUntil = 0;

const headersOf = (request) => {
  const origin = request.headers.get('Origin') || '';
  const h = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, PUT, DELETE, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type, X-Master-Key';
    h['Access-Control-Max-Age'] = '600';
    h.Vary = 'Origin';
  }
  return h;
};
const json = (request, value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: { ...headersOf(request), 'Content-Type': 'application/json; charset=utf-8' }
});
const error = (req, status, message) => json(req, { error: message }, status);
const validId = (s) => /^[a-z0-9_-]{1,100}$/i.test(s || '');
const utf8 = (s) => new TextEncoder().encode(s);
const decodeBase64url = (s) => {
  const v = String(s || '').replace(/-/g, '+').replace(/_/g, '/');
  return Uint8Array.from(atob(v + '='.repeat((4 - v.length % 4) % 4)), (x) => x.charCodeAt(0));
};
const parseJWT = (s) => {
  const parts = s.split('.');
  if (parts.length !== 3) throw Error('Bad token');
  const parse = (v) => JSON.parse(new TextDecoder().decode(decodeBase64url(v)));
  return { header: parse(parts[0]), body: parse(parts[1]), signed: utf8(parts[0] + '.' + parts[1]), signature: decodeBase64url(parts[2]) };
};
async function verifyOwner(request, env) {
  if (!env.OWNER_UID) throw Error('Missing OWNER_UID');
  const m = /^Bearer\s+(.+)$/i.exec(request.headers.get('Authorization') || '');
  if (!m) return false;
  try {
    const t = parseJWT(m[1]), h = t.header, p = t.body;
    const now = Math.floor(Date.now() / 1000);
    if (h.alg !== 'RS256' || !h.kid || p.aud !== PROJECT ||
        p.iss !== 'https://securetoken.google.com/' + PROJECT ||
        p.sub !== env.OWNER_UID || p.user_id !== env.OWNER_UID ||
        !Number.isFinite(p.iat) || !Number.isFinite(p.exp) || p.iat > now + 30 || p.exp <= now) return false;
    if (!keysCache || Date.now() >= keysUntil) {
      const r = await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
      if (!r.ok) return false;
      const j = await r.json();
      if (!Array.isArray(j.keys)) return false;
      keysCache = j.keys;
      keysUntil = Date.now() + 15 * 60 * 1000;
    }
    const jwk = keysCache.find((k) => k.kid === h.kid && k.kty === 'RSA');
    if (!jwk) return false;
    const key = await crypto.subtle.importKey('jwk', jwk, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['verify']);
    return await crypto.subtle.verify({ name: 'RSASSA-PKCS1-v1_5' }, key, t.signature, t.signed);
  } catch { return false; }
}
async function verifyReader(request, env) {
  const key = String(env.MCP_READ_KEY || '');
  // Standard auth headers supported by more MCP clients. Keep the legacy header for existing connections.
  const auth = request.headers.get('Authorization') || '';
  const got = request.headers.get('x-api-key') || request.headers.get('X-Master-Key') ||
    (/^Bearer\s+(.+)$/i.exec(auth)?.[1] || '');
  if (key.length < 32 || got.length !== key.length) return false;
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', utf8(key)), crypto.subtle.digest('SHA-256', utf8(got))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}
const bookKey = (id) => 'book:' + id;
// KV list + metadata вместо общего индекса: книги обновляются за один проход без
// конфликта «не более 1 записи в секунду» на ключе index в бесплатном Cloudflare.
const indexOf = async (kv) => {
  if (typeof kv.list !== 'function') return (await kv.get('index', { type: 'json' })) || [];
  const rows = [];
  let cursor;
  do {
    const page = await kv.list({ prefix: 'book:', limit: 500, ...(cursor ? { cursor } : {}) });
    for (const k of page.keys || []) {
      if (k.metadata?.id) rows.push(k.metadata);
      else {
        const data = await kv.get(k.name, { type: 'json' });
        if (data) rows.push({ id: data.id, title: data.title, updatedAt: data.updatedAt, chapters: data.chapters?.length || 0 });
      }
    }
    cursor = page.list_complete ? null : page.cursor;
  } while (cursor);
  return rows.sort((a, b) => String(a.title || '').localeCompare(String(b.title || ''), 'ru'));
};
const tool = (name, description, properties, required = []) => ({
  name, description, inputSchema: { type: 'object', properties, required, additionalProperties: false }
});
const BOOK_ID = { type: 'string', description: 'ID книги из list_books' };
const TOOLS = [
  tool('list_books', 'Список книг, которые писательница разрешила читать нейросети. Начинайте с него.', {}),
  tool('get_book_context', 'Канон, синопсис, персонажи, каркас и информация о выбранной книге (без полного текста глав).', { book_id: BOOK_ID }, ['book_id']),
  tool('list_chapters', 'Список и порядок всех глав книги, даты синхронизации и объём.', { book_id: BOOK_ID }, ['book_id']),
  tool('read_chapter', 'Прочитать фрагмент главы. Для длинных глав повторяйте вызов с новым offset.', {
    book_id: BOOK_ID, chapter: { type: 'integer', minimum: 1, description: 'Порядковый номер из list_chapters' },
    offset: { type: 'integer', minimum: 0, description: 'Смещение от начала главы в символах, по умолчанию 0' },
    limit: { type: 'integer', minimum: 1000, maximum: 30000, description: 'Не более 30 000 символов' }
  }, ['book_id', 'chapter']),
  tool('search_book', 'Найти фразу во всех написанных главах книги и показать контекст совпадений.', {
    book_id: BOOK_ID, query: { type: 'string', minLength: 2, maxLength: 200 }
  }, ['book_id', 'query'])
];

const SECTION_NAMES = ['marketing', 'income', 'direct'];
const sectionKey = (name) => 'section:' + name;
const contextTools = [
  tool('get_system_status', 'Состояние сохранённых источников: доступные книги, маркетинг, доходы, Директ и время их последней синхронизации.', {}),
  tool('get_marketing_overview', 'Аннотации, жанры, темы, идеи и сведения о продвижении книг из Мастерской.', {}),
  tool('get_book_marketing', 'Маркетинговые сведения только одной книги.', { book_id: BOOK_ID }, ['book_id']),
  tool('get_income_overview', 'Динамика роялти по месяцам, число продаж и обзор рекламных расходов. Даты выгрузки обязательны для интерпретации.', {}),
  tool('get_book_sales', 'Строки продаж и роялти выбранной книги (не более 250 за запрос).', {
    book: { type: 'string', description: 'Название книги или bookId' },
    from: { type: 'string', description: 'Дата от YYYY-MM-DD' },
    to: { type: 'string', description: 'Дата до YYYY-MM-DD' }
  }, ['book']),
  tool('get_direct_overview', 'Сохранённая (не живая) сводка кампаний Директа, последние расходы и качество рекламного трафика.', {}),
  tool('get_direct_campaign', 'Подробности одной кампании Директа и её статистика.', { campaign_id: { type: 'string' } }, ['campaign_id'])
];
TOOLS.push(...contextTools);
TOOLS.push(tool('get_direct_live', 'Живое чтение Яндекс.Директа прямо сейчас (только чтение): все кампании, включая черновики, группы с регионами и минус-фразами, объявления, фразы, параметры URL и расход за 30 дней. Без campaign_id — все кампании, с ним — одна.', {
  campaign_id: { type: 'string', description: 'Номер кампании Директа (необязательно)' },
  stats: { type: 'boolean', description: 'Расход по дням за 30 дней, по умолчанию да' }
}));

// ── Живое чтение Директа ─────────────────────────────────────────────────────
// Ключ Директа владелица передаёт из Мастерской (только по своему входу) и он лежит в KV.
// Наружу ключ не отдаётся никогда. Вызываются ТОЛЬКО методы get и отчёты — ничего не меняется.
const DIRECT_KEY = 'secret:direct-access';
const DIRECT_READ = new Set(['campaigns', 'adgroups', 'ads', 'keywords']);
const DIRECT_ERR = { 53: 'Ключ Директа устарел. Откройте «Директ», войдите через Яндекс заново, затем в Мастерской → Настройки → Нейросети нажмите «Обновить весь контекст».',
  58: 'Яндекс не одобрил доступ к API Директа.', 513: 'Этот аккаунт Яндекса не подключён к Директу.' };
const directBase = (acc, version = 'v5') => 'https://' + (acc.sandbox ? 'api-sandbox' : 'api') + '.direct.yandex.com/json/' + version + '/';
const directHeaders = (acc, extra = {}) => ({ Authorization: 'Bearer ' + acc.token, 'Content-Type': 'application/json; charset=utf-8',
  'Accept-Language': 'ru', ...(acc.clientLogin ? { 'Client-Login': acc.clientLogin } : {}), ...extra });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function directGet(acc, service, params, version = 'v5') {
  if (!DIRECT_READ.has(service)) throw Error('Только чтение');
  const res = await fetch(directBase(acc, version) + service, { method: 'POST', headers: directHeaders(acc), body: JSON.stringify({ method: 'get', params }) });
  let data = null; try { data = await res.json(); } catch { /* не JSON */ }
  if (data?.error) {
    const e = Error(DIRECT_ERR[data.error.error_code] || ('Директ отказал (код ' + data.error.error_code + '): ' + (data.error.error_string || '') + (data.error.error_detail ? ' — ' + data.error.error_detail : '')));
    e.code = Number(data.error.error_code);
    throw e;
  }
  if (!res.ok || !data) throw Error('Директ ответил ошибкой ' + res.status);
  return data.result || {};
}
// Расширенные поля — если Директ их не принял, повтор с основными
async function directSafe(acc, service, full, basic, version) {
  try { return await directGet(acc, service, full, version); }
  catch (e) { if (!basic || [53, 58, 513].includes(e.code)) throw e; return directGet(acc, service, basic, version); }
}
const rubOf = (v) => (v == null ? null : Math.round(Number(v) / 10000) / 100);
const tsv = (text) => {
  const rows = String(text || '').trim().split('\n').filter(Boolean).map((l) => l.split('\t'));
  const [head, ...rest] = rows;
  return head ? rest.map((r) => Object.fromEntries(head.map((h, i) => [h, r[i]]))) : [];
};
async function directDaily(acc, cid) {
  const body = { params: { SelectionCriteria: cid ? { Filter: [{ Field: 'CampaignId', Operator: 'EQUALS', Values: [String(cid)] }] } : {},
    FieldNames: ['Date', 'CampaignId', 'CampaignName', 'Impressions', 'Clicks', 'Cost'], ReportName: 'mcp-days-' + Date.now(),
    ReportType: 'CUSTOM_REPORT', DateRangeType: 'LAST_30_DAYS', Format: 'TSV', IncludeVAT: 'YES', IncludeDiscount: 'NO' } };
  const extra = { processingMode: 'auto', returnMoneyInMicros: 'false', skipReportHeader: 'true', skipReportSummary: 'true' };
  for (let i = 0; i < 5; i++) {
    const res = await fetch(directBase(acc) + 'reports', { method: 'POST', headers: directHeaders(acc, extra), body: JSON.stringify(body) });
    if (res.status === 200) return tsv(await res.text()).map((r) => ({ date: r.Date, cid: Number(r.CampaignId), name: r.CampaignName,
      impr: Number(r.Impressions) || 0, clicks: Number(r.Clicks) || 0, cost: Number(r.Cost) || 0 }));
    if (res.status === 201 || res.status === 202) { await wait(Math.min(Number(res.headers.get('retryIn')) || 3, 8) * 1000); continue; }
    throw Error('Отчёт Директа не получен (' + res.status + ')');
  }
  return null; // отчёт ещё готовится — структуру отдаём без него
}
export async function directLive(acc, { campaign_id, stats = true } = {}) {
  const only = campaign_id ? [Number(campaign_id)] : null;
  const BASE = ['Id', 'Name', 'State', 'Status', 'StatusClarification', 'StartDate', 'EndDate', 'DailyBudget', 'NegativeKeywords', 'Type'];
  const sel = only ? { Ids: only } : {};
  const cr = await directSafe(acc, 'campaigns',
    { SelectionCriteria: sel, FieldNames: BASE, TextCampaignFieldNames: ['BiddingStrategy', 'CounterIds', 'PriorityGoals'],
      UnifiedCampaignFieldNames: ['BiddingStrategy', 'CounterIds', 'PriorityGoals', 'TrackingParams'] },
    { SelectionCriteria: sel, FieldNames: BASE.slice(0, 7) }, 'v501');
  const campaigns = (cr.Campaigns || []).map((c) => {
    const x = c.TextCampaign || c.UnifiedCampaign || {};
    return { id: c.Id, name: c.Name, type: c.Type || '', state: c.State, status: c.Status, note: c.StatusClarification || '',
      start: c.StartDate || '', end: c.EndDate || '', daily: rubOf(c.DailyBudget?.Amount),
      negatives: c.NegativeKeywords?.Items || [], strategy: x.BiddingStrategy || null,
      counters: x.CounterIds?.Items || [], priorityGoals: x.PriorityGoals?.Items || [], trackingParams: x.TrackingParams || '' };
  });
  if (only && !campaigns.length) return { error: 'Кампания ' + campaign_id + ' не найдена в Директе.' };
  const cids = campaigns.filter((c) => c.state !== 'ARCHIVED').map((c) => c.id);
  let groups = [], ads = [], keywords = [];
  if (cids.length) {
    const gs = { CampaignIds: cids };
    groups = ((await directSafe(acc, 'adgroups', { SelectionCriteria: gs, FieldNames: ['Id', 'Name', 'CampaignId', 'Status', 'ServingStatus', 'RegionIds', 'NegativeKeywords', 'TrackingParams'] },
      { SelectionCriteria: gs, FieldNames: ['Id', 'Name', 'CampaignId'] }, 'v501')).AdGroups || [])
      .map((g) => ({ id: g.Id, name: g.Name, cid: g.CampaignId, status: g.Status || '', serving: g.ServingStatus || '',
        regions: g.RegionIds || [], negatives: g.NegativeKeywords?.Items || [], trackingParams: g.TrackingParams || '' }));
    ads = ((await directSafe(acc, 'ads', { SelectionCriteria: gs, FieldNames: ['Id', 'AdGroupId', 'CampaignId', 'Type', 'State', 'Status', 'StatusClarification'], TextAdFieldNames: ['Title', 'Title2', 'Text', 'Href', 'DisplayUrlPath'] },
      { SelectionCriteria: gs, FieldNames: ['Id', 'AdGroupId', 'CampaignId', 'State', 'Status'] }, 'v501')).Ads || [])
      .map((a) => ({ id: a.Id, gid: a.AdGroupId, cid: a.CampaignId, type: a.Type || '', state: a.State, status: a.Status, note: a.StatusClarification || '',
        title: a.TextAd?.Title || '', title2: a.TextAd?.Title2 || '', text: a.TextAd?.Text || '', href: a.TextAd?.Href || '', path: a.TextAd?.DisplayUrlPath || '' }));
    keywords = ((await directSafe(acc, 'keywords', { SelectionCriteria: gs, FieldNames: ['Id', 'Keyword', 'AdGroupId', 'CampaignId', 'Bid', 'State', 'Status'] },
      { SelectionCriteria: gs, FieldNames: ['Id', 'Keyword', 'AdGroupId', 'CampaignId', 'State', 'Status'] }, 'v501')).Keywords || [])
      .map((k) => ({ id: k.Id, phrase: k.Keyword, gid: k.AdGroupId, cid: k.CampaignId, bid: rubOf(k.Bid), state: k.State, status: k.Status }));
  }
  let daily = null, statsNote = '';
  if (stats) {
    try { daily = await directDaily(acc, only?.[0]); if (!daily) statsNote = 'Отчёт о расходе Директ ещё готовит — спросите ещё раз через минуту.'; }
    catch (e) { statsNote = e.message || String(e); }
  }
  return { at: new Date().toISOString(), live: true, sandbox: !!acc.sandbox, note: 'Живые данные из Директа. Только чтение — изменить отсюда ничего нельзя.',
    campaigns, groups, ads: ads.slice(0, 300), keywords: keywords.slice(0, 500), ...(stats ? { daily: daily || [], statsNote } : {}) };
}
async function directLiveTool(env, a) {
  const acc = await env.BOOKS.get(DIRECT_KEY, { type: 'json' });
  if (!acc?.token) return msg('Живой доступ к Директу не включён. В Мастерской → Настройки → Нейросети нажмите «Обновить весь контекст» и разрешите живое чтение Директа.', true);
  if (a.campaign_id != null && !/^\d{1,20}$/.test(String(a.campaign_id))) return msg('Номер кампании — только цифры.', true);
  try {
    const out = await directLive(acc, { campaign_id: a.campaign_id, stats: a.stats !== false });
    return out.error ? msg(out.error, true) : msg(out);
  } catch (e) { return msg(e.message || 'Директ не ответил', true); }
}
async function syncDirectAccess(req, env) {
  if (!['PUT', 'DELETE'].includes(req.method)) return error(req, 405, 'Метод не поддерживается');
  if (!(await verifyOwner(req, env))) return error(req, 401, 'Требуется вход владельца');
  if (req.method === 'DELETE') { await env.BOOKS.delete(DIRECT_KEY); return json(req, { ok: true, removed: true }); }
  const b = await req.json().catch(() => null);
  if (!b || typeof b.token !== 'string' || b.token.length < 20 || b.token.length > 400 || /\s/.test(b.token) ||
      (b.clientLogin != null && (typeof b.clientLogin !== 'string' || b.clientLogin.length > 100))) return error(req, 400, 'Неверный формат');
  await env.BOOKS.put(DIRECT_KEY, JSON.stringify({ token: b.token, clientLogin: b.clientLogin || '', sandbox: !!b.sandbox,
    exp: typeof b.exp === 'string' ? b.exp.slice(0, 40) : '', at: new Date().toISOString() }));
  return json(req, { ok: true });
}
async function sectionTool(env, name, a = {}) {
  const keys = { get_marketing_overview: 'marketing', get_book_marketing: 'marketing',
    get_income_overview: 'income', get_book_sales: 'income',
    get_direct_overview: 'direct', get_direct_campaign: 'direct' };
  if (name === 'get_system_status') {
    const [books, live, ...sections] = await Promise.all([indexOf(env.BOOKS), env.BOOKS.get(DIRECT_KEY, { type: 'json' }),
      ...SECTION_NAMES.map((v) => env.BOOKS.get(sectionKey(v), { type: 'json' }))]);
    return msg({ books, sections: SECTION_NAMES.map((name, i) => ({
      name, available: !!sections[i], updatedAt: sections[i]?.updatedAt || null
    })), directLive: live?.token ? { on: true, since: live.at || null, tokenUntil: live.exp || null } : { on: false } });
  }
  if (name === 'get_direct_live') return directLiveTool(env, a);
  const section = keys[name];
  if (!section) return null;
  const item = await env.BOOKS.get(sectionKey(section), { type: 'json' });
  if (!item) return msg('Источник ' + section + ' ещё не подключён или доступ к нему отозван.', true);
  const d = item.data || {};
  if (name === 'get_marketing_overview') return msg({ updatedAt: item.updatedAt,
    books: (d.books || []).map((x) => ({ ...x, promo: x.promo || {} })),
    ideas: (d.ideas || []).slice(0, 100), contests: (d.contests || []).slice(0, 50),
    reviews: (d.reviews || []).slice(0, 80), promos: (d.promos || []).slice(0, 150), blogs: (d.blogs || []).slice(0, 50) });
  if (name === 'get_book_marketing') {
    const b = (d.books || []).find((x) => x.id === a.book_id);
    return b ? msg({ updatedAt: item.updatedAt, book: b,
      ideas: (d.ideas || []).filter((x) => x.bookId === b.id),
      contests: (d.contests || []).filter((x) => (x.bookIds || []).includes(b.id)),
      reviews: (d.reviews || []).filter((x) => x.bookId === b.id),
      promos: (d.promos || []).filter((x) => x.bookId === b.id),
      blogs: (d.blogs || []).filter((x) => x.bookId === b.id) }) :
      msg('Книга не найдена в маркетинговом контексте.', true);
  }
  if (name === 'get_income_overview') return msg({ updatedAt: item.updatedAt,
    lastSaleDate: d.lastSaleDate, totals: d.totals, months: d.months,
    books: d.books, campaigns: d.campaigns, reports: d.reports });
  if (name === 'get_book_sales') {
    // В «Доходах» книга названа как на Литнете («Альпийский развод. Он оставил меня умирать»),
    // в Мастерской — коротко; ищем и по началу названия, и по ID книги Мастерской.
    const norm = (v) => String(v || '').toLocaleLowerCase('ru').replace(/ё/g, 'е').replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
    let q = norm(a.book);
    if (!q) return msg('Нужно название книги.', true);
    const own = (await indexOf(env.BOOKS)).find((b) => norm(b.id) === q);
    if (own) q = norm(own.title);
    const same = (x) => { const t = norm(x.book); return t === q || norm(x.bookId) === q || (q.length >= 6 && (t.startsWith(q + ' ') || q.startsWith(t + ' '))); };
    const found = (d.sales || []).filter((x) => same(x)
      && (!a.from || x.date >= a.from) && (!a.to || x.date <= a.to));
    return msg({ book: a.book, lastSaleDate: d.lastSaleDate, updatedAt: item.updatedAt,
      count: found.length, rows: found.slice(0, 250) });
  }
  if (name === 'get_direct_overview') return msg({ updatedAt: item.updatedAt, sourceAt: d.snapshotAt,
    campaigns: d.campaigns || [], daily: (d.daily || []).slice(-300),
    queries: (d.queries || []).slice(0, 50), metrika: d.metrika });
  if (name === 'get_direct_campaign') {
    const q = String(a.campaign_id || '');
    const camp = (d.campaigns || []).find((x) => String(x.id) === q);
    if (!camp) return msg('Кампания не найдена.', true);
    return msg({ updatedAt: item.updatedAt, campaign: camp,
      daily: (d.daily || []).filter((x) => String(x.cid) === q).slice(-90),
      queries: (d.queries || []).filter((x) => String(x.cid) === q).slice(0, 100),
      keywords: (d.keywords || []).filter((x) => String(x.cid) === q).slice(0, 100),
      adDaily: (d.adDaily || []).filter((x) => String(x.cid) === q).slice(-100) });
  }
  return null;
}
async function syncSection(req, env, name) {
  if (!SECTION_NAMES.includes(name)) return error(req, 404, 'Такого раздела нет');
  if (!['PUT', 'DELETE'].includes(req.method)) return error(req, 405, 'Метод не поддерживается');
  if (!(await verifyOwner(req, env))) return error(req, 401, 'Требуется вход владельца');
  if (req.method === 'DELETE') {
    await env.BOOKS.delete(sectionKey(name));
    return json(req, { ok: true, removed: true, section: name });
  }
  const raw = await req.text();
  if (utf8(raw).length > 5 * 1024 * 1024) return error(req, 413, 'Контекст слишком большой');
  let data; try { data = JSON.parse(raw); } catch { return error(req, 400, 'Неверный JSON'); }
  if (!data || data.section !== name || typeof data.generatedAt !== 'string') return error(req, 400, 'Неверный формат');
  const updatedAt = new Date().toISOString();
  await env.BOOKS.put(sectionKey(name), JSON.stringify({ data, updatedAt }));
  return json(req, { ok: true, section: name, updatedAt });
}

const msg = (x, isError = false) => ({ content: [{ type: 'text', text: typeof x === 'string' ? x : JSON.stringify(x, null, 2) }], ...(isError ? { isError: true } : {}) });
async function callTool(env, name, a) {
  const external = await sectionTool(env, name, a);
  if (external) return external;
  if (name === 'list_books') return msg(await indexOf(env.BOOKS));
  if (!validId(a?.book_id)) return msg('Укажите book_id из list_books.', true);
  const b = await env.BOOKS.get(bookKey(a.book_id), { type: 'json' });
  if (!b) return msg('Книга недоступна или доступ отозван.', true);
  if (name === 'get_book_context') return msg([b.context, '', 'Обновлено: ' + b.updatedAt, 'Глав: ' + b.chapters.length].join('\n'));
  if (name === 'list_chapters') return msg({ book: b.title, updatedAt: b.updatedAt, chapters: b.chapters.map((c, i) => ({ chapter: i + 1, title: c.title, chars: c.text.length })) });
  if (name === 'read_chapter') {
    const n = Number(a.chapter), chapter = Number.isInteger(n) && n >= 1 ? b.chapters[n - 1] : null;
    if (!chapter) return msg('Такой главы нет. Используйте list_chapters.', true);
    const offset = Number.isInteger(a.offset) && a.offset >= 0 ? a.offset : 0;
    const limit = Number.isInteger(a.limit) ? Math.min(30000, Math.max(1000, a.limit)) : 16000;
    return msg({ book: b.title, chapter: n, title: chapter.title, offset, totalChars: chapter.text.length, nextOffset: offset + limit < chapter.text.length ? offset + limit : null, text: chapter.text.slice(offset, offset + limit) });
  }
  if (name === 'search_book') {
    const q = String(a.query || '').trim().slice(0, 200);
    if (q.length < 2) return msg('Нужна фраза от двух символов.', true);
    const found = [];
    for (const [i, ch] of b.chapters.entries()) {
      const text = ch.text.toLocaleLowerCase('ru'), needle = q.toLocaleLowerCase('ru');
      let at = 0, hits = 0;
      while ((at = text.indexOf(needle, at)) !== -1 && hits < 5 && found.length < 18) {
        found.push({ chapter: i + 1, title: ch.title, offset: at, snippet: ch.text.slice(Math.max(0, at - 130), Math.min(ch.text.length, at + needle.length + 150)) });
        at += Math.max(1, needle.length); hits++;
      }
      if (found.length >= 18) break;
    }
    return msg({ query: q, matches: found });
  }
  return msg('Неизвестный инструмент.', true);
}
function rpc(id, result) { return { jsonrpc: '2.0', id, result }; }
async function mcp(req, env) {
  if (!(await verifyReader(req, env))) return error(req, 401, 'Нет доступа');
  if (req.method === 'GET') return new Response(null, { status: 405, headers: { ...headersOf(req), Allow: 'POST' } });
  if (req.method !== 'POST') return error(req, 405, 'Метод не поддерживается');
  let body;
  try { body = await req.json(); } catch { return error(req, 400, 'Неверный JSON'); }
  if (!body || body.jsonrpc !== '2.0' || typeof body.method !== 'string') return json(req, { jsonrpc: '2.0', id: body?.id ?? null, error: { code: -32600, message: 'Invalid Request' } }, 400);
  if (!Object.prototype.hasOwnProperty.call(body, 'id')) return new Response(null, { status: 202, headers: headersOf(req) });
  let result;
  try {
    switch (body.method) {
      case 'initialize': result = { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'masterskaya-ai', version: '1.3.0' } }; break;
      case 'ping': result = {}; break;
      case 'tools/list': result = { tools: TOOLS }; break;
      case 'tools/call':
        result = await callTool(env, body.params?.name, body.params?.arguments || {});
        break;
      default: return json(req, { jsonrpc: '2.0', id: body.id, error: { code: -32601, message: 'Method not found' } });
    }
  } catch { return json(req, { jsonrpc: '2.0', id: body.id, error: { code: -32603, message: 'Internal error' } }, 500); }
  return json(req, rpc(body.id, result));
}
async function sync(req, env, id) {
  if (!validId(id)) return error(req, 400, 'Неверный ID книги');
  if (!['PUT', 'DELETE'].includes(req.method)) return error(req, 405, 'Метод не поддерживается');
  if (!(await verifyOwner(req, env))) return error(req, 401, 'Требуется вход владельца в Мастерскую');
  if (req.method === 'DELETE') {
    await env.BOOKS.delete(bookKey(id));
    // Список книг формируется из ключей KV; отдельного индекса нет.
    return json(req, { ok: true, removed: true });
  }
  const size = Number(req.headers.get('Content-Length') || '0');
  if (size > MAX_BYTES) return error(req, 413, 'Слишком большой объём');
  let raw;
  try { raw = await req.text(); } catch { return error(req, 400, 'Ошибка чтения'); }
  if (utf8(raw).length > MAX_BYTES) return error(req, 413, 'Слишком большой объём');
  let b;
  try { b = JSON.parse(raw); } catch { return error(req, 400, 'Неверный JSON'); }
  if (!b || b.id !== id || typeof b.title !== 'string' || b.title.length > 300 ||
      typeof b.context !== 'string' || b.context.length > 900000 ||
      !Array.isArray(b.chapters) || b.chapters.length > 250 ||
      b.chapters.some((c) => !c || typeof c.title !== 'string' || typeof c.text !== 'string' || c.text.length > 500000)) {
    return error(req, 400, 'Неправильный формат книги');
  }
  const updatedAt = new Date().toISOString();
  const save = { id, title: b.title, context: b.context, chapters: b.chapters.map((c) => ({ title: c.title, text: c.text })), updatedAt };
  await env.BOOKS.put(bookKey(id), JSON.stringify(save), {
    metadata: { id, title: b.title, updatedAt, chapters: b.chapters.length }
  });
  return json(req, { ok: true, updatedAt, chapters: b.chapters.length });
}
// Сервисные команды доступны только владелице: убрать старые книги, удалённые из Мастерской,
// или полностью отключить всё. Через MCP эти операции не вызываются.
async function manageSnapshots(req, env, action) {
  if (action === 'prune' && req.method !== 'POST') return error(req, 405, 'Метод не поддерживается');
  if (action === 'all' && req.method !== 'DELETE') return error(req, 405, 'Метод не поддерживается');
  if (!(await verifyOwner(req, env))) return error(req, 401, 'Требуется вход владельца');
  let keep = null;
  if (action === 'prune') {
    const body = await req.json().catch(() => null);
    if (!body || !Array.isArray(body.ids) || body.ids.length > 500 || body.ids.some((id) => !validId(id)))
      return error(req, 400, 'Неверный список книг');
    keep = new Set(body.ids);
  }
  const books = await indexOf(env.BOOKS);
  let removed = 0;
  for (const book of books) {
    if (keep && keep.has(book.id)) continue;
    await env.BOOKS.delete(bookKey(book.id));
    removed++;
  }
  if (action === 'all') {
    for (const name of SECTION_NAMES) await env.BOOKS.delete(sectionKey(name));
    await env.BOOKS.delete(DIRECT_KEY);
  }
  return json(req, { ok: true, removed, action });
}
export default {
  async fetch(req, env) {
    const url = new URL(req.url), origin = req.headers.get('Origin') || '';
    if (origin && !ORIGINS.has(origin) && url.pathname.startsWith('/sync/')) return error(req, 403, 'Источник запрещён');
    if (req.method === 'OPTIONS') return ORIGINS.has(origin)
      ? new Response(null, { status: 204, headers: headersOf(req) })
      : error(req, 403, 'Источник запрещён');
    if (url.pathname === '/health') return json(req, { ok: !!env.BOOKS, configured: !!env.BOOKS && !!env.OWNER_UID && String(env.MCP_READ_KEY || '').length >= 32 });
    if (!env.BOOKS) return error(req, 503, 'Не подключено KV BOOKS');
    try {
      if (url.pathname === '/mcp') return await mcp(req, env);
      if (url.pathname === '/sync/prune') return await manageSnapshots(req, env, 'prune');
      if (url.pathname === '/sync/all') return await manageSnapshots(req, env, 'all');
      if (url.pathname === '/sync/direct-access') return await syncDirectAccess(req, env);
      const section = /^\/sync\/section\/([a-z]+)$/.exec(url.pathname);
      if (section) return await syncSection(req, env, section[1]);
      const match = /^\/sync\/([^/]+)$/.exec(url.pathname);
      if (match) return await sync(req, env, match[1]);
    } catch { return error(req, 500, 'Временная ошибка сервиса'); }
    return error(req, 404, 'Не найдено');
  }
};
