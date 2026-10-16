// Переходник для приложения «Директ»: Cloudflare Worker (бесплатный план).
// Браузер не может обращаться к API Директа напрямую (Яндекс не разрешает запросы со страниц сайтов),
// поэтому приложение шлёт запрос сюда, а переходник передаёт его в Директ и возвращает ответ.
// Ничего не хранит и не пишет в журналы. Ключ Яндекса приходит в заголовке Authorization от самого приложения.
// Как поставить — docs/SETUP-DIRECT.md.

// Откуда можно пользоваться переходником: только с сайта владелицы (и с компьютера при проверке)
const ALLOWED_ORIGINS = ['https://erichthoxx-sketch.github.io', 'http://localhost:8765'];

const TARGETS = {
  live: 'https://api.direct.yandex.com',
  sandbox: 'https://api-sandbox.direct.yandex.com',
};
// Какие заголовки пропускаем в Директ и обратно
const PASS_IN = ['authorization', 'content-type', 'client-login', 'accept-language', 'processingmode', 'returnmoneyinmicros', 'skipreportheader', 'skipcolumnheader', 'skipreportsummary'];
const PASS_OUT = ['content-type', 'retryin', 'reportsinqueue', 'units', 'requestid'];

function cors(origin) {
  return {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
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
