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
const VERSION = '5'; // 4 — поддержка API v501 для новых единых перфоманс-кампаний
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



// Wordstat — отдельный ПЛАТНЫЙ API. Ключ только в Cloudflare secrets, не в браузере.
// Запросы выключены по умолчанию. Один GetTop = 0,02 ₽ по объявленному тарифу.
const WORDSTAT_UNIT_RUB = 0.02;
const WORDSTAT_BUDGET_RUB = 50;
const WORDSTAT_MAX_CALLS = Math.floor(WORDSTAT_BUDGET_RUB / WORDSTAT_UNIT_RUB);
const jsonOut = (obj, status, origin) => new Response(JSON.stringify(obj), {
  status, headers:{...cors(origin),'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'}
});
const decoded = str => {
  const base=String(str).replace(/-/g,'+').replace(/_/g,'/');
  return JSON.parse(atob(base+'='.repeat((4-base.length%4)%4)));
};
async function authorizedWordstatUser(token,env) {
  const parts=String(token||'').split('.');
  if(parts.length!==3) return false;
  const project=String(env.FIREBASE_PROJECT_ID||'');
  const owner=String(env.WORDSTAT_OWNER_EMAIL||'').toLowerCase();
  if(!project||!owner) return false;
  const head=decoded(parts[0]),payload=decoded(parts[1]);
  if(head.alg!=='RS256'||!head.kid||payload.aud!==project||
     payload.iss!=='https://securetoken.google.com/'+project||!payload.sub||
     String(payload.email||'').toLowerCase()!==owner||
     !Number.isFinite(payload.exp)||payload.exp<=Date.now()/1000||
     !Number.isFinite(payload.iat)||payload.iat>Date.now()/1000) return false;
  const jwksRes=await fetch('https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com');
  if(!jwksRes.ok)return false;
  const jwks=await jwksRes.json(),jwk=jwks.keys?.find(x=>x.kid===head.kid);
  if(!jwk)return false;
  const key=await crypto.subtle.importKey('jwk',jwk,{name:'RSASSA-PKCS1-v1_5',hash:'SHA-256'},false,['verify']);
  const data=new TextEncoder().encode(parts[0]+'.'+parts[1]);
  const base=parts[2].replace(/-/g,'+').replace(/_/g,'/');
  const raw=atob(base+'='.repeat((4-base.length%4)%4));
  const signature=Uint8Array.from(raw,c=>c.charCodeAt(0));
  return crypto.subtle.verify('RSASSA-PKCS1-v1_5',key,signature,data);
}
async function wordstatTop(request,env,origin) {
  // Всё fail-closed, в том числе если не настроен счетчик или аккаунт.
  if(env.WORDSTAT_ENABLED!=='true')return jsonOut({error:'Wordstat пока выключен. Подключи сервис в Cloudflare.'},503,origin);
  if(!env.WORDSTAT_API_KEY||!env.WORDSTAT_FOLDER_ID||!env.WORDSTAT_COUNTER||!env.FIREBASE_PROJECT_ID||!env.WORDSTAT_OWNER_EMAIL)
    return jsonOut({error:'Wordstat настроен не полностью в Cloudflare.'},503,origin);
  let approved=false;
  try{approved=await authorizedWordstatUser((request.headers.get('authorization')||'').replace(/^Bearer\s+/i,''),env);}
  catch{approved=false;}
  if(!approved)return jsonOut({error:'Для Wordstat нужен вход владельца в приложение.'},401,origin);
  let args;
  try{args=await request.json();}catch{return jsonOut({error:'Неверный запрос'},400,origin);}
  const phrase=String(args.phrase||'').trim(),regions=Array.isArray(args.regions)?args.regions:[];
  if(!phrase||phrase.length>200||phrase.split(/\s+/).length>15||
      regions.length>2||regions.some(x=>!/^\d{1,6}$/.test(String(x))))
      return jsonOut({error:'Нужна одна фраза до 200 символов и не более двух регионов'},400,origin);
  const month=new Date().toISOString().slice(0,7),counter='wordstat:'+month;
  const used=Number(await env.WORDSTAT_COUNTER.get(counter)||0);
  if(!Number.isFinite(used)||used>=WORDSTAT_MAX_CALLS)
    return jsonOut({error:'Месячный лимит Wordstat 50 ₽ достигнут'},429,origin);
  // Резервируем запрос ДО обращения к платному API. KV имеет eventual consistency:
  // жесткий предел при одновременных запросах не гарантируется. Автоопрос запрещен.
  await env.WORDSTAT_COUNTER.put(counter,String(used+1),{expirationTtl:60*60*24*40});
  const endpoint='https://searchapi.api.cloud.yandex.net/v2/wordstat/topRequests';
  const upstream=await fetch(endpoint,{method:'POST',headers:{
    'Authorization':'Api-Key '+env.WORDSTAT_API_KEY,
    'Content-Type':'application/json'
  },body:JSON.stringify({phrase,regions:regions.map(String),numPhrases:'100',devices:['DEVICE_ALL'],folderId:env.WORDSTAT_FOLDER_ID})});
  let payload;
  try{payload=await upstream.json();}catch{payload={};}
  if(!upstream.ok)return jsonOut({error:'Wordstat ответил ошибкой '+upstream.status,details:payload?.message||''},upstream.status>=500?502:upstream.status,origin);
  return jsonOut({phrase,totalCount:payload.totalCount||'0',results:(payload.results||[]).slice(0,100),
    associations:(payload.associations||[]).slice(0,20),usage:{month,requests:used+1,
      estimatedRub:Number(((used+1)*WORDSTAT_UNIT_RUB).toFixed(2)),limitRub:WORDSTAT_BUDGET_RUB}},200,origin);
}
export default {
  async fetch(request, env = {}) {
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
    if(url.pathname === '/wordstat/top') {
      if(request.method !== 'POST')return jsonOut({error:'Только POST'},405,origin);
      return wordstatTop(request,env,origin);
    }
    if (request.method !== 'POST') return new Response('Только POST', { status: 405, headers: cors(origin) });

    // /live/json/v501/campaigns → https://api.direct.yandex.com/json/v501/campaigns
    // старый /json/v5 для чтения и существующих кампаний тоже поддерживается
    const m = /^\/(live|sandbox)(\/json\/v(?:5|501)\/[a-z]+)$/.exec(url.pathname);
    if (!m) return new Response('Неизвестный адрес', { status: 404, headers: cors(origin) });

    const headers = new Headers();
    for (const h of PASS_IN) { const v = request.headers.get(h); if (v) headers.set(h, v); }
    const res = await fetch(TARGETS[m[1]] + m[2], { method: 'POST', headers, body: await request.arrayBuffer() });

    const out = new Headers(cors(origin));
    for (const h of PASS_OUT) { const v = res.headers.get(h); if (v) out.set(h, v); }
    return new Response(res.body, { status: res.status, headers: out });
  },
};
