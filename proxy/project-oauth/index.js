import { OAuthProvider } from '@cloudflare/workers-oauth-provider';

const issuer = 'https://freitag-project-oauth.erichtho-xx.workers.dev';
const gateway = 'https://freitag-opus-gateway.erichtho-xx.workers.dev';
const scope = 'project:read';
const escape = value => String(value).replace(/[&<>"']/g, c => '&#' + c.charCodeAt(0) + ';');

function projectEndpoint(value) {
  const url = new URL(value);
  const project = url.searchParams.get('project');
  if (url.origin !== gateway || url.pathname !== '/project-mcp' || !/^[\w-]{1,100}$/.test(project || ''))
    throw Error('Invalid project');
  return gateway + '/project-mcp?project=' + encodeURIComponent(project);
}

async function consent(req, env) {
  const oauth = env.OAUTH_PROVIDER;
  if (new URL(req.url).pathname !== '/authorize') return new Response(null,{status:404});
  if (req.method === 'GET') {
    const request = await oauth.parseAuthRequest(req);
    if (request.codeChallengeMethod !== 'S256' || !request.codeChallenge ||
        new URL(request.redirectUri).origin !== 'https://chatgpt.com')
      return new Response('Требуется подключение из ChatGPT с PKCE.',{status:400});
    const details = await oauth.describeConsent(request);
    const pending = await oauth.beginConsent(request);
    pending.headers.set('Content-Type','text/html; charset=utf-8');
    pending.headers.set('Referrer-Policy','no-referrer');
    pending.headers.set('Cache-Control','no-store');
    return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Доступ к книге Freitag</title><main><h1>Чтение проекта Freitag</h1><p>Приложение ${escape(details.clientName)} на ${escape(details.redirectHost)} получит доступ к инструкции, материалам, чатам и связанной рукописи одного проекта.</p><p>Открой в Freitag книгу → «Передать проект». Скопируй два поля в эту форму.</p><form method="post"><input type="hidden" name="handle" value="${escape(pending.handle)}"><p><label>Адрес MCP проекта <input name="url" type="url" required></label></p><p><label>Ключ проекта (Authorization) <input name="key" type="password" autocomplete="off" required></label></p><button name="decision" value="approve">Разрешить чтение</button> <button name="decision" value="deny" formnovalidate>Отмена</button></form></main></html>`,{headers:pending.headers});
  }
  if (req.method !== 'POST' || req.headers.get('Origin') !== issuer) return new Response(null,{status:403});
  const form = await req.formData();
  const handle = String(form.get('handle'));
  if (form.get('decision') !== 'approve') {
    const denied = await oauth.denyConsent(req,handle);
    return new Response(null,{status:302,headers:denied.headers});
  }
  const url = projectEndpoint(String(form.get('url')));
  const key = String(form.get('key')).trim().replace(/^Bearer\s+/i,'');
  if (!/^frg_[a-f0-9]{64}$/.test(key)) return new Response('Проверь ключ проекта.',{status:400});
  const check = await fetch(url,{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+key,'Content-Type':'application/json'},body:JSON.stringify({jsonrpc:'2.0',id:1,method:'ping'})});
  if (!check.ok || !(await check.json()).result) return new Response('Freitag не подтвердил доступ к проекту.',{status:403});
  const approved = await oauth.approveConsent(req,handle,{scope:[scope]});
  const {redirectTo} = await oauth.completeAuthorization({request:approved.request,userId:new URL(url).searchParams.get('project'),metadata:{},scope:[scope],props:{url,key}});
  approved.headers.set('Location',redirectTo);
  return new Response(null,{status:302,headers:approved.headers});
}

const provider = new OAuthProvider({
  apiRoute:'/mcp', authorizeEndpoint:'/authorize', tokenEndpoint:'/token', clientRegistrationEndpoint:'/register',
  clientIdMetadataDocumentEnabled:true, scopesSupported:[scope], requiredScopes:[scope],
  resourceMetadata:{resource:issuer+'/mcp',authorization_servers:[issuer]},
  defaultHandler:{async fetch(req,env){try{return await consent(req,env);}catch{return new Response('Запрос подключения недействителен. Начни подключение заново.',{status:400});}}},
  apiHandler:{async fetch(req,env,ctx){
    if (!ctx.auth.scope.includes(scope)) return new Response(null,{status:403});
    if (req.method !== 'POST') return new Response(null,{status:405,headers:{Allow:'POST'}});
    return fetch(projectEndpoint(ctx.props.url),{method:'POST',redirect:'manual',headers:{Authorization:'Bearer '+ctx.props.key,'Content-Type':'application/json'},body:req.body});
  }}
});

export { OAuthRecords } from './records.js';
export default {
  fetch(req,env,ctx){
    const records=env.RECORDS.getByName('oauth');
    return provider.fetch(req,{...env,OAUTH_KV:records},ctx);
  }
};
