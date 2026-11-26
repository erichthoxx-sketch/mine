// Изолированный Pinterest Worker. Не подключать к существующим Worker Мастерской.
const ORIGINS = new Set(['https://erichthoxx-sketch.github.io', 'http://localhost:8765']);
const PROJECT = 'dohody-6d6dd';

let keysCache = null, keysUntil = 0;

const headersOf = (request) => {
  const origin = request.headers.get('Origin') || '';
  const h = { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' };
  if (ORIGINS.has(origin)) {
    h['Access-Control-Allow-Origin'] = origin;
    h['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    h['Access-Control-Allow-Headers'] = 'Authorization, Content-Type';
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

const API='https://api.pinterest.com/v5';
const SCOPES='user_accounts:read,boards:read,pins:read,pins:write';
const enc = new TextEncoder(), dec = new TextDecoder();
const hex = b => Array.from(b,x=>x.toString(16).padStart(2,'0')).join('');
const hash = async s=>hex(new Uint8Array(await crypto.subtle.digest('SHA-256',enc.encode(s))));
const random = ()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const base64 = b=>btoa(Array.from(b,x=>String.fromCharCode(x)).join(''));
const un64 = s=>Uint8Array.from(atob(s),x=>x.charCodeAt(0));
async function keyOf(env){
  if(!/^[0-9a-f]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY||''))throw Error('Invalid encryption configuration');
  return crypto.subtle.importKey('raw',Uint8Array.from(env.TOKEN_ENCRYPTION_KEY.match(/../g),x=>parseInt(x,16)),{name:'AES-GCM'},false,['encrypt','decrypt']);
}
async function seal(env,record){
  const iv=crypto.getRandomValues(new Uint8Array(12));
  const data=await crypto.subtle.encrypt({name:'AES-GCM',iv},await keyOf(env),enc.encode(JSON.stringify(record)));
  return base64(iv)+'.'+base64(new Uint8Array(data));
}
async function unseal(env,value){
  const [iv,data]=value.split('.');
  return JSON.parse(dec.decode(await crypto.subtle.decrypt({name:'AES-GCM',iv:un64(iv)},await keyOf(env),un64(data))));
}
function ready(env){
  return !!(env.PINTEREST_DB&&env.OWNER_UID&&env.PINTEREST_APP_ID&&env.PINTEREST_APP_SECRET&&/^https:\/\/[^/]+\/oauth\/callback$/.test(env.PINTEREST_REDIRECT_URI||'')&&/^[0-9a-f]{64}$/i.test(env.TOKEN_ENCRYPTION_KEY||''));
}
function oauthURL(env,state){
  const url=new URL('https://www.pinterest.com/oauth/');
  url.search=new URLSearchParams({client_id:env.PINTEREST_APP_ID,redirect_uri:env.PINTEREST_REDIRECT_URI,response_type:'code',scope:SCOPES,state});
  return url.href;
}
async function tokenExchange(env,params){
  const r=await fetch(API+'/oauth/token',{method:'POST',redirect:'error',headers:{Authorization:'Basic '+btoa(env.PINTEREST_APP_ID+':'+env.PINTEREST_APP_SECRET),'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams(params),signal:AbortSignal.timeout(20000)});
  if(!r.ok)throw Error('Pinterest authorization failed ('+r.status+')');
  const t=await r.json();
  if(typeof t.access_token!=='string'||!Number.isFinite(t.expires_in)||t.expires_in<=0)throw Error('Invalid token response');
  return {access:t.access_token,refresh:t.refresh_token||'',expires:Date.now()+t.expires_in*1000};
}
async function loadToken(env){
  const row=await env.PINTEREST_DB.prepare("SELECT value FROM pinterest_connection WHERE id=1").first();
  return row?unseal(env,row.value):null;
}
async function storeToken(env,t){
  await env.PINTEREST_DB.prepare("INSERT INTO pinterest_connection(id,value) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(await seal(env,t)).run();
}
const htmlPage=(message,status=200)=>new Response('<!doctype html><html lang="ru"><meta charset="utf-8"><title>Pinterest</title><p>'+message+'</p><p>Закройте эту вкладку и вернитесь в Мастерскую.</p></html>',{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','Content-Security-Policy':"default-src 'none'; frame-ancestors 'none'",'X-Content-Type-Options':'nosniff'}});
async function callback(req,env,url){
  if(!ready(env))return htmlPage('Сервис не настроен.',503);
  const state=url.searchParams.get('state')||'';
  if(!/^[0-9a-f]{64}$/.test(state))return htmlPage('Недействительный запрос авторизации.',400);
  const used=await env.PINTEREST_DB.prepare('DELETE FROM pinterest_oauth_state WHERE digest=? AND expires>? RETURNING digest').bind(await hash(state),Date.now()).first();
  if(!used)return htmlPage('Ссылка истекла или уже использована.',400);
  const code=url.searchParams.get('code');
  if(!code||code.length>4000||url.searchParams.has('error'))return htmlPage('Подключение отменено.',400);
  try{
    const t=await tokenExchange(env,{grant_type:'authorization_code',code,redirect_uri:env.PINTEREST_REDIRECT_URI,continuous_refresh:'true'});
    await storeToken(env,t);
    return htmlPage('Pinterest подключен. Обновите данные в Мастерской.');
  }catch{return htmlPage('Pinterest не подтвердил подключение. Начните авторизацию заново.',502);}
}
const err=(message,status=400)=>Object.assign(Error(message),{status});
const idOf=v=>typeof v==='string'&&/^[0-9]{1,30}$/.test(v);
const dateOf=v=>typeof v==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(v)&&Number.isFinite(Date.parse(v))&&new Date(v).toISOString().slice(0,10)===v;
export function analyticsQuery(start,end,now=Date.now()){
  if(!dateOf(start)||!dateOf(end)||start>end||Date.parse(end)>now||Date.parse(end)-Date.parse(start)>89*86400000)throw err('Некорректный период аналитики');
  return new URLSearchParams({start_date:start,end_date:end,metric_types:'IMPRESSION,SAVE,OUTBOUND_CLICK',app_types:'ALL',split_field:'NO_SPLIT'}).toString();
}
export function pinPayload(b){
  if(!b||b.approved!==true||typeof b.requestId!=='string'||!/^[a-zA-Z0-9_-]{16,100}$/.test(b.requestId)||!idOf(b.boardId))throw err('Нужны выбранный пин, доска и явное подтверждение');
  const f=(k,n)=>typeof b[k]==='string'&&b[k].trim()&&b[k].length<=n;
  if(!f('title',100)||!f('description',500)||!f('alt',500)||!f('link',1000))throw err('Проверьте обязательные поля');
  let u;try{u=new URL(b.link);}catch{throw err('Неверная ссылка');}
  if(u.protocol!=='https:'||u.hostname!=='lanafreitag.ru'||u.username||u.password||(!u.pathname.startsWith('/kniga/')&&!u.searchParams.get('kniga')))throw err('Нужна ссылка на конкретную книгу на lanafreitag.ru');
  if(!['image/jpeg','image/png'].includes(b.contentType)||typeof b.image!=='string'||b.image.length>14*1024*1024||!/^[A-Za-z0-9+/]+={0,2}$/.test(b.image)||b.image.length%4!==0)throw err('Нужен JPG или PNG до 10 МБ');
  let prefix;try{prefix=atob(b.image.slice(0,16));}catch{throw err('Некорректное изображение');}
  if(b.contentType==='image/jpeg'?!prefix.startsWith('\xff\xd8\xff'):!prefix.startsWith('\x89PNG\r\n\x1a\n'))throw err('Формат файла не совпадает');
  return {board_id:b.boardId,title:b.title,description:b.description,alt_text:b.alt,link:u.href,media_source:{source_type:'image_base64',content_type:b.contentType,data:b.image}};
}
async function requestJSON(req,max=16384){
  if(Number(req.headers.get('Content-Length')||0)>max)throw err('Запрос слишком большой',413);
  const reader=req.body?.getReader();if(!reader)throw err('Нет данных');
  const parts=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>max){await reader.cancel();throw err('Запрос слишком большой',413);}parts.push(value);}}finally{reader.releaseLock();}
  const buf=new Uint8Array(size);let pos=0;for(const part of parts){buf.set(part,pos);pos+=part.length;}
  try{return JSON.parse(dec.decode(buf));}catch{throw err('Некорректный JSON');}
}
async function pinterest(path,t,body){
  const r=await fetch(API+path,{method:body?'POST':'GET',redirect:'error',headers:{Authorization:'Bearer '+t.access,...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(25000)});
  if(!r.ok)throw err('Pinterest вернул HTTP '+r.status,r.status===429?429:r.status===401?401:502);
  return r.json();
}
export default {async fetch(req,env){
  const url=new URL(req.url),path=url.pathname;
  if(req.method==='OPTIONS')return new Response(null,{status:204,headers:headersOf(req)});
  if(path==='/oauth/callback'&&req.method==='GET'){
    try{return await callback(req,env,url);}catch{return htmlPage('Ошибка подключения. Начните авторизацию заново.',502);}
  }
  try{
    if(!ORIGINS.has(req.headers.get('Origin')))return error(req,403,'Forbidden origin');
    if(!ready(env))return error(req,503,'Pinterest Worker не настроен');
    if(!await verifyOwner(req,env))return error(req,401,'Требуется вход владельца');
    const db=env.PINTEREST_DB;
    if(path==='/connect'&&req.method==='POST'){
      const state=random();
      await db.prepare('DELETE FROM pinterest_oauth_state WHERE expires<=?').bind(Date.now()).run();
      await db.prepare('INSERT INTO pinterest_oauth_state(digest,expires) VALUES(?,?)').bind(await hash(state),Date.now()+10*60000).run();
      return json(req,{url:oauthURL(env,state)});
    }
    if(path==='/disconnect'&&req.method==='POST'){
      await db.batch([db.prepare('DELETE FROM pinterest_connection'),db.prepare('DELETE FROM pinterest_oauth_state')]);
      return json(req,{ok:true});
    }
    const t=await loadToken(env),expired=!!t&&t.expires<Date.now()+60000;
    if(path==='/status'&&req.method==='GET')return json(req,{connected:!!t&&!expired,expired,publishEnabled:env.PINTEREST_PUBLISH_ENABLED==='true'});
    if(!t||expired)return error(req,409,'Подключите Pinterest заново: срок авторизации истек или аккаунт не подключен');
    if(path==='/profile'&&req.method==='GET'){
      const p=await pinterest('/user_account',t);return json(req,{username:p.username,account_type:p.account_type,website_url:p.website_url,about:p.about});
    }
    if(path==='/boards'&&req.method==='GET'){
      const bookmark=url.searchParams.get('bookmark')||'';
      if(bookmark.length>2000)throw err('Некорректная страница');
      const q=new URLSearchParams({page_size:'100'});if(bookmark)q.set('bookmark',bookmark);
      const r=await pinterest('/boards?'+q,t);
      return json(req,{items:(r.items||[]).map(x=>({id:x.id,name:x.name,description:x.description,privacy:x.privacy})),bookmark:r.bookmark||null});
    }
    if(path==='/analytics'&&req.method==='GET'){
      const pin=url.searchParams.get('pin_id');if(!idOf(pin))throw err('Нужен ID пина');
      return json(req,await pinterest('/pins/'+pin+'/analytics?'+analyticsQuery(url.searchParams.get('start'),url.searchParams.get('end')),t));
    }
    if(path==='/publish'&&req.method==='POST'){
      if(env.PINTEREST_PUBLISH_ENABLED!=='true')return error(req,403,'Публикация выключена до подтверждения доступа Pinterest');
      const b=await requestJSON(req,15*1024*1024),payload=pinPayload(b);
      // Не повторяем отправку после тайм-аута: возможно, Pinterest уже создал пин.
      const lock=await db.prepare("INSERT OR IGNORE INTO pinterest_submission(id,status,at) VALUES(?, 'pending', ?)").bind(b.requestId,Date.now()).run();
      if(!lock.meta.changes)return error(req,409,'Этот пин уже отправлялся. Проверьте Pinterest; повторная отправка заблокирована.');
      try{
        const p=await pinterest('/pins',t,payload);
        if(!idOf(p.id))throw Error('Missing Pin ID');
        await db.prepare("UPDATE pinterest_submission SET status='sent' WHERE id=?").bind(b.requestId).run();
        return json(req,{ok:true,pinId:p.id});
      }catch{
        await db.prepare("UPDATE pinterest_submission SET status='uncertain' WHERE id=?").bind(b.requestId).run();
        return error(req,502,'Результат отправки неизвестен. Проверьте Pinterest вручную. Повтор заблокирован.');
      }
    }
    return error(req,404,'Неизвестный маршрут');
  }catch(e){return error(req,e.status||500,e.status?e.message:'Внутренняя ошибка Pinterest Worker');}
}};
