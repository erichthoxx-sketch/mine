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

const SECTION_NAMES = ['marketing', 'income', 'direct', 'cohorts'];
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
  tool('get_direct_overview', 'Кампании Директа (все, включая черновики), группы, объявления, фразы и расход за 30 дней — живые данные, если владелица дала доступ; иначе сохранённая копия. Плюс Метрика.', {}),
  tool('get_direct_campaign', 'Одна кампания Директа (в т. ч. черновик): настройки, группы, объявления, фразы, расход — живые данные, если есть доступ.', { campaign_id: { type: 'string' } }, ['campaign_id'])
];
TOOLS.push(...contextTools);
const ATTR_D = { type: 'string', description: 'Модель атрибуции Директа: AUTO (по умолчанию), LSCCD, FCCD или LC' };
const PERIOD = { from: { type: 'string', description: 'Дата от YYYY-MM-DD (по умолчанию 7 дней назад)' }, to: { type: 'string', description: 'Дата до YYYY-MM-DD (по умолчанию сегодня; сегодня — неполный день)' } };
TOOLS.push(
  tool('get_direct_report', 'Статистика Директа по дням и кампаниям с конверсиями по каждой цели Метрики (Reports API): показы, клики, расход, CTR, цена клика, конверсии, цена и доля конверсии. Можно разрез «поиск / сети». Только чтение.', {
    campaign_id: { type: 'string', description: 'Номер кампании (по умолчанию все)' }, ...PERIOD, attribution: ATTR_D,
    goals: { type: 'array', items: { type: 'string' }, description: 'Номера целей (по умолчанию все цели счётчика кампании, не больше 10)' },
    split: { type: 'string', description: '"network" — разрез поиск / сети' }, counter_id: { type: 'string', description: 'Счётчик (по умолчанию — из кампании)' } }),
  tool('get_direct_search_queries', 'Поисковые запросы кампании Директа с показами, кликами, расходом и конверсиями по целям — для минус-слов и чистки автотаргетинга (данные за последние 180 дней).', {
    campaign_id: { type: 'string' }, ...PERIOD, attribution: ATTR_D, goals: { type: 'array', items: { type: 'string' } } }, ['campaign_id']),
  tool('get_metrika_sources', 'Метрика по источникам до кампании (API отчётов): визиты, посетители, отказы, по каждой цели — достижения и посетители; итог и по дням.', {
    ...PERIOD, attribution: { type: 'string', description: 'automatic (по умолчанию), cross_device_last_significant, cross_device_first или last' },
    group_by: { type: 'string', description: 'source — тип источника; engine — рекламная система; direct — кампания Директа; utm — utm_source + utm_campaign + utm_content' },
    goals: { type: 'array', items: { type: 'string' } }, counter_id: { type: 'string' }, by_day: { type: 'boolean' } }),
  tool('get_cohorts', 'Когорты по Logs API Метрики: посетители, чей ПЕРВЫЙ визит пришёл из источника, — сколько начали читать, добавили в библиотеку, начали покупку, купили; медианы дней; покупки в поздних визитах и их источники; библиотека → покупка.', {
    source_filter: { type: 'string', description: 'direct:<номер кампании> | utm_campaign:<…> | utm_source:<…> | utm_content:<…> | type:<тип источника> | engine:<рекламная система>' },
    ...PERIOD, window_days: { type: 'integer', minimum: 1, maximum: 365, description: 'Сколько дней после первого визита считать (по умолчанию 30)' } }, ['source_filter']),
);
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
    ReportType: 'CUSTOM_REPORT', DateRangeType: 'CUSTOM_DATE', Format: 'TSV', IncludeVAT: 'YES', IncludeDiscount: 'NO' } };
  // LAST_30_DAYS у Директа — без текущего дня; берём 30 дней по сегодня включительно (сегодня — неполный день)
  body.params.SelectionCriteria = { ...body.params.SelectionCriteria, DateFrom: addD(mskToday(), -29), DateTo: mskToday() };
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
      negatives: c.NegativeKeywords?.Items || [], strategy: x.BiddingStrategy ? moneyDeep(x.BiddingStrategy) : null,
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
  return { at: new Date().toISOString(), live: true, sandbox: !!acc.sandbox, note: 'Живые данные из Директа. Только чтение — изменить отсюда ничего нельзя. Деньги — в рублях.',
    ...(stats ? { period: { from: addD(mskToday(), -29), to: mskToday() }, todayNote: mskToday() + ' — текущий день, данные за него неполные' } : {}),
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
// ── Аналитика для нейросети (10.11.2026): отчёты Директа с конверсиями, поисковые запросы, источники Метрики, когорты ──
// Только чтение. Названия полей и моделей атрибуции — по документации Яндекса (Reports API Директа v5, API отчётов Метрики).
// С 25.06.2026 старые модели (первый переход, последний значимый, последний переход из Директа) Яндекс заменил:
// Директ — FCCD | LC | LSCCD | AUTO, Метрика — cross_device_first | last | cross_device_last_significant | automatic.
const ATTR_DIRECT = { FCCD: 'первый переход (кросс-девайс)', LC: 'последний переход', LSCCD: 'последний значимый переход (кросс-девайс)', AUTO: 'автоматическая атрибуция' };
const ATTR_METRIKA = { cross_device_first: 'первый переход (кросс-девайс)', last: 'последний переход', cross_device_last_significant: 'последний значимый переход (кросс-девайс)', automatic: 'автоматическая атрибуция' };
const ATTR_ALIAS = { FCCD: 'cross_device_first', LC: 'last', LSCCD: 'cross_device_last_significant', AUTO: 'automatic' };
const METRIKA = 'https://api-metrika.yandex.net/';
// «Сегодня» — по Москве (так считают Директ и счётчик)
export const mskToday = (now = Date.now()) => new Date(now + 3 * 3600000).toISOString().slice(0, 10);
const addD = (iso, n) => new Date(Date.parse(iso + 'T00:00:00Z') + n * 86400000).toISOString().slice(0, 10);
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
function period(a, days = 7) {
  const today = mskToday(), to = isDate(a.to) ? a.to : today, from = isDate(a.from) ? a.from : addD(to, -(days - 1));
  if (from > to) throw Error('Дата «от» позже даты «до».');
  return { from, to: to > today ? today : to, today };
}
const metaOf = ({ from, to, today }, attribution, extra = {}) => ({
  fetchedAt: new Date().toISOString(), period: { from, to }, attribution,
  ...(to >= today ? { todayNote: `${today} — текущий день, данные за него неполные` } : {}), ...extra,
});
// деньги в ответах — в рублях: поля стратегии в миллионных долях (Cpa 8000000 → 8)
const MONEY_KEY = /(Cpa|Cpc|Bid|Amount|SpendLimit|Limit|Price|Budget)$/;
export function moneyDeep(x) {
  if (Array.isArray(x)) return x.map(moneyDeep);
  if (!x || typeof x !== 'object') return x;
  return Object.fromEntries(Object.entries(x).map(([k, v]) => [k, typeof v === 'number' && MONEY_KEY.test(k) ? rubOf(v) : moneyDeep(v)]));
}
// Отчёт Reports API (TSV, деньги в рублях); 201/202 — ждём и спрашиваем снова
async function directReport(acc, params) {
  const body = { params: { ...params, ReportName: (params.ReportName || 'mcp') + '-' + Date.now(), Format: 'TSV', IncludeVAT: 'YES', IncludeDiscount: 'NO' } };
  const extra = { processingMode: 'auto', returnMoneyInMicros: 'false', skipReportHeader: 'true', skipReportSummary: 'true' };
  for (let i = 0; i < 8; i++) {
    const res = await fetch(directBase(acc) + 'reports', { method: 'POST', headers: directHeaders(acc, extra), body: JSON.stringify(body) });
    if (res.status === 200) return { rows: tsv(await res.text()), warning: res.headers.get('Warning') || '' };
    if (res.status === 201 || res.status === 202) { await wait(Math.min(Number(res.headers.get('retryIn')) || 3, 8) * 1000); continue; }
    let detail = ''; try { const j = await res.json(); detail = j?.error?.error_detail || j?.error?.error_string || ''; } catch { /* не JSON */ }
    throw Error('Отчёт Директа не получен (' + res.status + ')' + (detail ? ': ' + detail : ''));
  }
  throw Error('Директ ещё готовит отчёт — спросите через минуту.');
}
const num = (v) => { const n = Number(String(v ?? '').replace(',', '.')); return Number.isFinite(n) ? n : 0; };
// Цели счётчика из Метрики (название по номеру)
async function metrikaGoals(acc, counter) {
  const r = await fetch(METRIKA + 'management/v1/counter/' + counter + '/goals', { headers: { Authorization: 'OAuth ' + acc.token } });
  if (!r.ok) throw Error('Метрика не отдала цели счётчика ' + counter + ' (' + r.status + ')');
  return ((await r.json()).goals || []).map((g) => ({ id: String(g.id), name: g.name }));
}
// Счётчики кампаний Директа (из настроек кампании)
async function directCounters(acc, cid) {
  const cr = await directSafe(acc, 'campaigns', { SelectionCriteria: cid ? { Ids: [Number(cid)] } : {}, FieldNames: ['Id', 'Name', 'State'],
    TextCampaignFieldNames: ['CounterIds'], UnifiedCampaignFieldNames: ['CounterIds'] }, null, 'v501');
  return (cr.Campaigns || []).map((c) => ({ id: c.Id, name: c.Name, state: c.State, counters: (c.UnifiedCampaign || c.TextCampaign || {}).CounterIds?.Items || [] }));
}
const goalPick = (all, want) => (Array.isArray(want) && want.length ? all.filter((g) => want.map(String).includes(g.id)) : all).slice(0, 10);
const attrDirect = (v) => { const k = String(v || 'AUTO').toUpperCase(); if (!ATTR_DIRECT[k]) throw Error('Модель атрибуции: FCCD, LC, LSCCD или AUTO (старые FC, LSC, LYDC Яндекс больше не считает).'); return k; };

// Задача 1: статистика Директа с конверсиями по каждой цели
export async function directReportTool(acc, a) {
  const p = period(a), model = attrDirect(a.attribution);
  if (a.campaign_id != null && !/^\d{1,20}$/.test(String(a.campaign_id))) throw Error('Номер кампании — только цифры.');
  const camps = await directCounters(acc, a.campaign_id);
  if (a.campaign_id && !camps.length) throw Error('Кампания ' + a.campaign_id + ' не найдена.');
  const counter = String(a.counter_id || camps.flatMap((c) => c.counters)[0] || '');
  const goals = counter ? goalPick(await metrikaGoals(acc, counter), a.goals) : [];
  const split = a.split === 'network';
  const fields = ['Date', 'CampaignId', 'CampaignName', ...(split ? ['AdNetworkType'] : []), 'Impressions', 'Clicks', 'Cost', 'Ctr', 'AvgCpc', ...(goals.length ? ['Conversions', 'CostPerConversion', 'ConversionRate'] : [])];
  const r = await directReport(acc, { ReportName: 'mcp-goals', ReportType: 'CUSTOM_REPORT', DateRangeType: 'CUSTOM_DATE', FieldNames: fields,
    SelectionCriteria: { DateFrom: p.from, DateTo: p.to, ...(a.campaign_id ? { Filter: [{ Field: 'CampaignId', Operator: 'EQUALS', Values: [String(a.campaign_id)] }] } : {}) },
    ...(goals.length ? { Goals: goals.map((g) => g.id), AttributionModels: [model] } : {}) });
  // колонки вида Conversions_<цель>_<модель>; модель в названии берём из ответа (Яндекс мог заменить устаревшую)
  const col = (row, kind, g) => { const k = Object.keys(row).find((x) => x.startsWith(kind + '_' + g + '_')); return k ? row[k] : null; };
  const rows = r.rows.map((row) => ({
    date: row.Date, cid: Number(row.CampaignId), campaign: row.CampaignName, ...(split ? { network: row.AdNetworkType === 'AD_NETWORK' ? 'сети' : row.AdNetworkType === 'SEARCH' ? 'поиск' : row.AdNetworkType } : {}),
    impressions: num(row.Impressions), clicks: num(row.Clicks), cost: num(row.Cost), ctr: num(row.Ctr), avgCpc: num(row.AvgCpc),
    goals: Object.fromEntries(goals.map((g) => [g.id, { conversions: num(col(row, 'Conversions', g.id)), costPerConversion: num(col(row, 'CostPerConversion', g.id)) || null, conversionRate: num(col(row, 'ConversionRate', g.id)) || null }])),
  }));
  const sum = (list) => {
    const t = { impressions: 0, clicks: 0, cost: 0, goals: {} };
    for (const x of list) { t.impressions += x.impressions; t.clicks += x.clicks; t.cost += x.cost; for (const [g, v] of Object.entries(x.goals)) t.goals[g] = (t.goals[g] || 0) + v.conversions; }
    t.cost = Math.round(t.cost * 100) / 100;
    return { ...t, ctr: t.impressions ? Math.round(t.clicks / t.impressions * 10000) / 100 : null, avgCpc: t.clicks ? Math.round(t.cost / t.clicks * 100) / 100 : null,
      goals: Object.fromEntries(goals.map((g) => [g.id, { name: g.name, conversions: t.goals[g.id] || 0, costPerConversion: t.goals[g.id] ? Math.round(t.cost / t.goals[g.id] * 100) / 100 : null, conversionRate: t.clicks ? Math.round((t.goals[g.id] || 0) / t.clicks * 10000) / 100 : null }])) };
  };
  const byCamp = {};
  for (const x of rows) (byCamp[x.cid] ||= []).push(x);
  return { ...metaOf(p, `${model} — ${ATTR_DIRECT[model]}`, { counter: counter || null, goals, currency: 'RUB, с НДС', units: 'ctr и conversionRate — в процентах', ...(r.warning ? { yandexWarning: r.warning } : {}) }),
    total: sum(rows), campaigns: Object.entries(byCamp).map(([cid, list]) => ({ cid: Number(cid), name: list[0].campaign, ...sum(list) })), rows: rows.slice(0, 2000) };
}

// Задача 1: поисковые запросы с конверсиями (данные — за последние 180 дней)
export async function directQueriesTool(acc, a) {
  if (!/^\d{1,20}$/.test(String(a.campaign_id || ''))) throw Error('Нужен номер кампании (только цифры).');
  const p = period(a, 30), model = attrDirect(a.attribution);
  if (p.from < addD(p.today, -180)) throw Error('Поисковые запросы Директ отдаёт только за последние 180 дней.');
  const camps = await directCounters(acc, a.campaign_id);
  const counter = String(a.counter_id || camps.flatMap((c) => c.counters)[0] || '');
  const goals = counter ? goalPick(await metrikaGoals(acc, counter), a.goals) : [];
  const r = await directReport(acc, { ReportName: 'mcp-queries', ReportType: 'SEARCH_QUERY_PERFORMANCE_REPORT', DateRangeType: 'CUSTOM_DATE',
    FieldNames: ['Query', 'Criterion', 'CriterionType', 'MatchType', 'Impressions', 'Clicks', 'Cost', ...(goals.length ? ['Conversions'] : [])],
    SelectionCriteria: { DateFrom: p.from, DateTo: p.to, Filter: [{ Field: 'CampaignId', Operator: 'EQUALS', Values: [String(a.campaign_id)] }] },
    ...(goals.length ? { Goals: goals.map((g) => g.id), AttributionModels: [model] } : {}) });
  const col = (row, g) => { const k = Object.keys(row).find((x) => x.startsWith('Conversions_' + g + '_')); return k ? num(row[k]) : 0; };
  const rows = r.rows.map((row) => ({ query: row.Query, condition: row.Criterion, conditionType: row.CriterionType, matchType: row.MatchType,
    impressions: num(row.Impressions), clicks: num(row.Clicks), cost: num(row.Cost), goals: Object.fromEntries(goals.map((g) => [g.id, col(row, g.id)])) }))
    .sort((x, y) => y.cost - x.cost || y.clicks - x.clicks);
  return { ...metaOf(p, `${model} — ${ATTR_DIRECT[model]}`, { campaignId: Number(a.campaign_id), goals, currency: 'RUB, с НДС', note: 'Запросы с показами. Разреза «поиск / сети» в этом отчёте у Директа нет.' }),
    count: rows.length, rows: rows.slice(0, 1000) };
}

// Задача 2: Метрика по источникам до кампании (API отчётов)
const GROUPS = { source: ['ym:s:<attribution>TrafficSource'], engine: ['ym:s:<attribution>AdvEngine'], direct: ['ym:s:<attribution>DirectClickOrder'],
  utm: ['ym:s:<attribution>UTMSource', 'ym:s:<attribution>UTMCampaign', 'ym:s:<attribution>UTMContent'] };
export async function metrikaSourcesTool(acc, a) {
  const p = period(a, 7), group = GROUPS[a.group_by || 'source'];
  if (!group) throw Error('group_by: source, engine, direct или utm.');
  const attr = ATTR_ALIAS[String(a.attribution || '').toUpperCase()] || String(a.attribution || 'automatic');
  if (!ATTR_METRIKA[attr]) throw Error('Модель атрибуции: cross_device_first, last, cross_device_last_significant или automatic.');
  let counter = String(a.counter_id || '');
  if (!counter) counter = String((await directCounters(acc)).flatMap((c) => c.counters)[0] || '');
  if (!/^\d+$/.test(counter)) throw Error('Не нашла счётчик Метрики: укажите counter_id.');
  const goals = goalPick(await metrikaGoals(acc, counter), a.goals).slice(0, 8); // ≤ 3 + 2×8 метрик в запросе
  const metrics = ['ym:s:visits', 'ym:s:users', 'ym:s:bounceRate', ...goals.flatMap((g) => [`ym:s:goal${g.id}reaches`, `ym:s:goal${g.id}users`])];
  const get = async (dims, limit) => {
    const q = new URLSearchParams({ ids: counter, metrics: metrics.join(','), dimensions: dims.join(','), date1: p.from, date2: p.to, attribution: attr, limit: String(limit), accuracy: 'full', lang: 'ru' });
    const r = await fetch(METRIKA + 'stat/v1/data?' + q, { headers: { Authorization: 'OAuth ' + acc.token } });
    const j = await r.json().catch(() => null);
    if (!r.ok) throw Error('Метрика: ' + (j?.message || r.status));
    return (j.data || []).map((row) => {
      const m = row.metrics || [], out = { key: (row.dimensions || []).map((d) => d?.name ?? d?.id ?? null), visits: Math.round(m[0] || 0), users: Math.round(m[1] || 0), bounceRate: Math.round((m[2] || 0) * 10) / 10, goals: {} };
      goals.forEach((g, i) => { out.goals[g.id] = { reaches: Math.round(m[3 + i * 2] || 0), users: Math.round(m[4 + i * 2] || 0) }; });
      return out;
    });
  };
  const total = await get(group, 100);
  const byDay = a.by_day === false ? null : await get(['ym:s:date', ...group], 1000);
  return { ...metaOf(p, `${attr} — ${ATTR_METRIKA[attr]}`, { counter, groupBy: a.group_by || 'source', goals, units: 'bounceRate — в процентах' }),
    total, ...(byDay ? { byDay: byDay.map((x) => ({ date: x.key[0], key: x.key.slice(1), visits: x.visits, users: x.users, bounceRate: x.bounceRate, goals: x.goals })) } : {}) };
}

// Задача 3: когорты. Логи Метрики выгружает и считает «Директ» в браузере владелицы (вариант А); сюда приходят только
// обезличенные строки посетителей без ClientID (день первого визита, источник, дни до целей). Отдаём только итоги.
export function cohortStats(data, a) {
  const S = data.sources || [], src = String(a.source_filter || '').trim();
  if (!src) throw Error('source_filter: например direct:715936525, utm_campaign:…, utm_source:…, type:ad.');
  const [kind, ...rest] = src.split(':'), val = rest.join(':').toLowerCase();
  const match = (s) => s && (kind === 'direct' ? String(s.d || '') === val : kind === 'utm_campaign' ? String(s.c || '').toLowerCase() === val
    : kind === 'utm_source' ? String(s.s || '').toLowerCase() === val : kind === 'utm_content' ? String(s.n || '').toLowerCase() === val
      : kind === 'type' ? String(s.t || '').toLowerCase() === val : kind === 'engine' ? String(s.e || '').toLowerCase() === val : false);
  const from = isDate(a.from) ? a.from : data.from, to = isDate(a.to) ? a.to : data.to, win = Math.min(365, Math.max(1, Number(a.window_days) || 30));
  const base = data.from, day = (d) => addD(base, d);
  const people = (data.people || []).filter((p) => match(S[p[1]]) && day(p[0]) >= from && day(p[0]) <= to);
  const within = (v) => v != null && v >= 0 && v <= win;
  const med = (xs) => { if (!xs.length) return null; const s = [...xs].sort((x, y) => x - y), m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; };
  const cnt = (i) => people.filter((p) => within(p[i])).length;
  // p = [первый день, источник первого визита, чтение, библиотека, начало покупки, покупка (дни от первого визита), покупка не в первом визите, источник визита покупки]
  const buyers = people.filter((p) => within(p[5])), late = buyers.filter((p) => p[6]);
  const lateSrc = {};
  for (const p of late) { const s = S[p[7]] || {}; const k = s.d ? 'Директ ' + s.d : s.c ? 'utm ' + [s.s, s.c].filter(Boolean).join(' / ') : s.t || 'неизвестно'; lateSrc[k] = (lateSrc[k] || 0) + 1; }
  const lib = people.filter((p) => within(p[3])), libBuy = lib.filter((p) => within(p[5]) && p[5] >= p[3]);
  return {
    fetchedAt: data.at, period: { from, to }, logsPeriod: { from: data.from, to: data.to }, windowDays: win, source: src,
    attribution: 'источник каждого визита — его собственный переход (last); когорта — по первому визиту посетителя в выгруженном периоде',
    note: 'Данные Logs API — до вчерашнего дня. Посетитель, приходивший раньше начала выгрузки, считается новым. Для посетителей последних дней окно ещё не закрылось.',
    size: people.length, incompleteWindow: people.filter((p) => day(p[0]) > addD(data.to, -win)).length,
    startedReading: cnt(2), addedToLibrary: lib.length, startedPurchase: cnt(4), purchased: buyers.length,
    medianDaysToLibrary: med(lib.map((p) => p[3])), medianDaysToPurchase: med(buyers.map((p) => p[5])),
    purchasesInLaterVisits: late.length, laterVisitSources: lateSrc,
    libraryToPurchase: { added: lib.length, thenPurchased: libBuy.length, rate: lib.length ? Math.round(libBuy.length / lib.length * 1000) / 10 : null },
  };
}

// Logs API Метрики для «Директа» владелицы (вариант А): Worker только пересылает запрос с её ключом из KV и отдаёт ответ браузеру —
// ничего не хранит и не разбирает. Только операции выгрузки логов: оценка, создание запроса, статус, скачивание части, очистка.
// Счётчик и его цели не меняются. Вход — только владелица (Firebase).
async function syncLogs(req, env) {
  if (req.method !== 'POST') return error(req, 405, 'Метод не поддерживается');
  if (!(await verifyOwner(req, env))) return error(req, 401, 'Требуется вход владельца');
  const acc = await env.BOOKS.get(DIRECT_KEY, { type: 'json' });
  if (!acc?.token) return error(req, 409, 'Нет ключа Яндекса — откройте «Директ»');
  const b = await req.json().catch(() => null);
  const counter = String(b?.counter || ''), id = String(b?.id || ''), part = String(b?.part ?? '');
  if (!/^\d{1,12}$/.test(counter)) return error(req, 400, 'Неверный счётчик');
  const base = METRIKA + 'management/v1/counter/' + counter + '/';
  const q = (o) => new URLSearchParams(Object.fromEntries(Object.entries(o).filter(([, v]) => v != null && v !== ''))).toString();
  const params = { date1: b.date1, date2: b.date2, fields: b.fields, source: 'visits', attribution: b.attribution };
  if (['evaluate', 'create'].includes(b.op) && (!isDate(b.date1) || !isDate(b.date2) || !/^[\w:<>,]{5,3000}$/.test(String(b.fields || '')))) return error(req, 400, 'Неверные параметры');
  if (['info', 'download', 'clean'].includes(b.op) && !/^\d{1,15}$/.test(id)) return error(req, 400, 'Неверный запрос логов');
  const target = { evaluate: ['GET', base + 'logrequests/evaluate?' + q(params)], create: ['POST', base + 'logrequests?' + q(params)],
    info: ['GET', base + 'logrequest/' + id], download: ['GET', base + 'logrequest/' + id + '/part/' + (/^\d{1,4}$/.test(part) ? part : '0') + '/download'],
    clean: ['POST', base + 'logrequest/' + id + '/clean'] }[b.op];
  if (!target) return error(req, 400, 'Неизвестная операция');
  const r = await fetch(target[1], { method: target[0], headers: { Authorization: 'OAuth ' + acc.token } });
  return new Response(r.body, { status: r.status, headers: { ...headersOf(req), 'Content-Type': r.headers.get('content-type') || 'text/plain; charset=utf-8' } });
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
  const live = { get_direct_report: directReportTool, get_direct_search_queries: directQueriesTool, get_metrika_sources: metrikaSourcesTool }[name];
  if (live) {
    const acc = await env.BOOKS.get(DIRECT_KEY, { type: 'json' });
    if (!acc?.token) return msg('Нет доступа к Яндексу: откройте «Мастерскую» или «Директ» — доступ передастся сам.', true);
    try { return msg(await live(acc, a)); } catch (e) { return msg(e.message || 'Яндекс не ответил', true); }
  }
  if (name === 'get_cohorts') {
    const item = await env.BOOKS.get(sectionKey('cohorts'), { type: 'json' });
    if (!item?.data?.people) return msg('Когорт ещё нет: их считает «Директ» в браузере владелицы раз в сутки (Logs API Метрики). Откройте «Директ» — посчитает сам; ошибка, если была, видна в «Директе» → Настройки.', true);
    try { return msg(cohortStats(item.data, a)); } catch (e) { return msg(e.message, true); }
  }
  const section = keys[name];
  if (!section) return null;
  // Директ: если владелица дала живой доступ — отвечаем живыми данными, копия — только запасной вариант
  if (name === 'get_direct_overview' || name === 'get_direct_campaign') {
    const acc = await env.BOOKS.get(DIRECT_KEY, { type: 'json' });
    if (acc?.token) {
      const q = name === 'get_direct_campaign' ? String(a.campaign_id || '') : '';
      if (q && !/^\d{1,20}$/.test(q)) return msg('Номер кампании — только цифры.', true);
      try {
        const out = await directLive(acc, { campaign_id: q || undefined });
        if (out.error) return msg(out.error, true);
        if (!q) { const snap = await env.BOOKS.get(sectionKey('direct'), { type: 'json' }); out.metrika = snap?.data?.metrika; }
        return msg(out);
      } catch (e) {
        const snap = await env.BOOKS.get(sectionKey('direct'), { type: 'json' });
        if (!snap) return msg(e.message || 'Директ не ответил', true);
        // ниже — сохранённая копия, с пометкой, почему не живые данные
        a = { ...a, liveError: e.message || String(e) };
      }
    }
  }
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
  if (name === 'get_direct_overview') return msg({ ...(a.liveError ? { liveError: a.liveError } : {}), updatedAt: item.updatedAt, sourceAt: d.snapshotAt,
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
      case 'initialize': result = { protocolVersion: '2025-03-26', capabilities: { tools: { listChanged: false } }, serverInfo: { name: 'masterskaya-ai', version: '1.5.0' } }; break;
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
      if (url.pathname === '/sync/logs') return await syncLogs(req, env);
      const section = /^\/sync\/section\/([a-z]+)$/.exec(url.pathname);
      if (section) return await syncSection(req, env, section[1]);
      const match = /^\/sync\/([^/]+)$/.exec(url.pathname);
      if (match) return await sync(req, env, match[1]);
    } catch { return error(req, 500, 'Временная ошибка сервиса'); }
    return error(req, 404, 'Не найдено');
  }
};
