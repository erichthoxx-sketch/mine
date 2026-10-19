// Переходник для приложения «Директ»: Cloudflare Worker (бесплатный план).
// Браузер не может обращаться к API Директа и Метрики напрямую (Яндекс не разрешает запросы со страниц сайтов),
// поэтому приложение шлёт запрос сюда, а переходник передаёт его в Яндекс и возвращает ответ.
// Метрика — только чтение (GET): счётчики, цели, статистика.
// Страницы конкурсов (GET /page?url=…) — только с площадок из списка PAGE_HOSTS, чтобы «Мастерская» сама подтягивала условия.
// Ничего не хранит и не пишет в журналы. Ключ Яндекса приходит в заголовке Authorization от самого приложения.
// Как поставить — docs/SETUP-DIRECT.md.

// Откуда можно пользоваться переходником: только с сайта владелицы (и с компьютера при проверке)
const ALLOWED_ORIGINS = ['https://erichthoxx-sketch.github.io', 'http://localhost:8765'];

const TARGETS = {
  live: 'https://api.direct.yandex.com',
  sandbox: 'https://api-sandbox.direct.yandex.com',
  metrika: 'https://api-metrika.yandex.net',
};
const VERSION = '3'; // 2 — добавлена Метрика; 3 — страницы конкурсов
const PAGE_HOSTS = ['litnet.com', 'litgorod.ru', 'litmarket.ru', 'litres.ru', 'author.today', 'prodaman.ru', 'feisovet.ru', 'litsovet.ru', 'ridero.ru', 'eksmo.ru', 'ast.ru', 'vk.com', 'vk.ru', 't.me'];
// Какие заголовки пропускаем в Директ и обратно
const PASS_IN = ['authorization', 'content-type', 'client-login', 'accept-language', 'processingmode', 'returnmoneyinmicros', 'skipreportheader', 'skipcolumnheader', 'skipreportsummary'];
const PASS_OUT = ['content-type', 'retryin', 'reportsinqueue', 'units', 'requestid'];

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': PASS_IN.join(', '),
    'Access-Control-Expose-Headers': PASS_OUT.join(', '),
    'Access-Control-Max-Age': '86400',
    Vary: 'Origin',
  };
}

export default {
  async fetch(request) {
    const origin = request.headers.get('Origin') || '';
    const url = new URL(request.url);
    if (url.pathname === '/ping') return new Response('ok', { headers: ALLOWED_ORIGINS.includes(origin) ? cors(origin) : {} });
    if (!ALLOWED_ORIGINS.includes(origin)) return new Response('Нет доступа', { status: 403 });
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors(origin) });
    if (url.pathname === '/version') return new Response(VERSION, { headers: cors(origin) });

    // страница конкурса: только чтение и только с известных площадок
    if (url.pathname === '/page') {
      let target;
      try { target = new URL(url.searchParams.get('url') || ''); } catch { return new Response('Нет ссылки', { status: 400, headers: cors(origin) }); }
      const host = target.hostname.replace(/^www\./, '');
      if (target.protocol !== 'https:' || !PAGE_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return new Response('Эту площадку переходник не открывает', { status: 403, headers: cors(origin) });
      const res = await fetch(target.toString(), { headers: { 'User-Agent': 'Mozilla/5.0', 'Accept-Language': 'ru' }, redirect: 'follow' });
      const out = new Headers(cors(origin));
      out.set('content-type', 'text/html; charset=utf-8');
      return new Response(await res.text(), { status: res.status, headers: out });
    }
    // Метрика, только чтение: /metrika/stat/v1/data?… → https://api-metrika.yandex.net/stat/v1/data?…
    const mm = /^\/metrika(\/(?:management|stat)\/v1\/[a-z0-9_/.]+)$/i.exec(url.pathname);
    if (mm) {
      if (request.method !== 'GET') return new Response('Только GET', { status: 405, headers: cors(origin) });
      const res = await fetch(TARGETS.metrika + mm[1] + url.search, { headers: { Authorization: request.headers.get('authorization') || '' } });
      const out = new Headers(cors(origin));
      out.set('content-type', res.headers.get('content-type') || 'application/json');
      return new Response(res.body, { status: res.status, headers: out });
    }
    if (request.method !== 'POST') return new Response('Только POST', { status: 405, headers: cors(origin) });

    // /live/json/v5/campaigns → https://api.direct.yandex.com/json/v5/campaigns
    const m = /^\/(live|sandbox)(\/json\/v5\/[a-z]+)$/.exec(url.pathname);
    if (!m) return new Response('Неизвестный адрес', { status: 404, headers: cors(origin) });

    const headers = new Headers();
    for (const h of PASS_IN) { const v = request.headers.get(h); if (v) headers.set(h, v); }
    const res = await fetch(TARGETS[m[1]] + m[2], { method: 'POST', headers, body: await request.arrayBuffer() });

    const out = new Headers(cors(origin));
    for (const h of PASS_OUT) { const v = res.headers.get(h); if (v) out.set(h, v); }
    return new Response(res.body, { status: res.status, headers: out });
  },
};
