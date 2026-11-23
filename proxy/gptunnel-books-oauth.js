import books, { GptunnelSseSession } from './gptunnel-books-worker.js';
export { GptunnelSseSession };

const CLIENT = 'masterskaya-books';
const CALLBACK = 'https://gptunnel.ru/mcp_auth2_finish.html';
const SCOPE = 'books:read';
const SECRET = /^[a-f0-9]{64}$/;
const PROOF = /^[a-zA-Z0-9_-]{43}$/;
const HEADERS = { 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer' };
const json = (body, status = 200) => Response.json(body, { status, headers: HEADERS });
const invalid = (error = 'invalid_request', status = 400) => json({ error }, status);
const random = (size) => Array.from(crypto.getRandomValues(new Uint8Array(size)), (n) => n.toString(16).padStart(2, '0')).join('');
const digest = async (msg) => new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(msg)));
const challenge = async (verifier) => btoa(String.fromCharCode(...await digest(verifier))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const usableKey = (key) => typeof key === 'string' && SECRET.test(key);
async function admin(request, key) {
  const sent = request.headers.get('Authorization')?.match(/^Bearer ([a-f0-9]{64})$/)?.[1];
  if (!sent || !usableKey(key)) return false;
  const [a, b] = await Promise.all([digest(sent), digest(key)]);
  return a.reduce((difference, byte, i) => difference | (byte ^ b[i]), 0) === 0;
}

export class GptunnelOauthRequest {
  constructor(state, env) { this.state = state; this.env = env; }

  async fetch(req) {
    const path = new URL(req.url).pathname;
    const storage = this.state.storage;
    if (path === '/start') {
      const payload = await req.json();
      await storage.put('request', { ...payload, expires: Date.now() + 5 * 60_000 });
      await storage.setAlarm(Date.now() + 6 * 60_000);
      return json({ ok: true });
    }
    if (path === '/approve') return storage.transaction(async (txn) => {
      const row = await txn.get('request');
      if (!row || Date.now() >= row.expires || row.code) return invalid('expired_or_approved', 404);
      await txn.put('request', { ...row, code: random(26) });
      return json({ ok: true });
    });
    if (path === '/token') {
      const { proof, code } = await req.json();
      return storage.transaction(async (txn) => {
        const row = await txn.get('request');
        if (!row || Date.now() >= row.expires || row.code !== code || row.proof !== proof) return invalid('invalid_grant');
        await txn.delete('request');
        return json({ token_type: 'Bearer', access_token: this.env.GPTUNNEL_WORKSHOP_KEY, scope: SCOPE });
      });
    }
    const row = await storage.get('request');
    if (!row || Date.now() >= row.expires) return invalid('expired_request', 410);
    return json({ code: row.code, state: row.state });
  }

  async alarm() { await this.state.storage.deleteAll(); }
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { origin, pathname: path } = url;
    if (!env.OAUTH_REQUESTS || !usableKey(env.OAUTH_APPROVAL_KEY) || !usableKey(env.GPTUNNEL_WORKSHOP_KEY)) return invalid('unavailable', 503);
    const session = (id) => env.OAUTH_REQUESTS.get(env.OAUTH_REQUESTS.idFromName(id));
    const resource = /^\/\.well-known\/oauth-protected-resource(?:\/(mcp|sse))?$/.exec(path);
    if (resource && req.method === 'GET') return json({ resource: `${origin}/${resource[1] || 'mcp'}`, authorization_servers: [origin], scopes_supported: [SCOPE] });
    if (path === '/.well-known/oauth-authorization-server' && req.method === 'GET') return json({ issuer: origin,
      authorization_endpoint: `${origin}/oauth/authorize`, token_endpoint: `${origin}/oauth/token`,
      response_types_supported: ['code'], grant_types_supported: ['authorization_code'], code_challenge_methods_supported: ['S256'],
      token_endpoint_auth_methods_supported: ['none'], scopes_supported: [SCOPE] });

    if (path === '/oauth/authorize' && req.method === 'GET') {
      const p = url.searchParams;
      const state = p.get('state');
      const proof = p.get('code_challenge');
      if (p.get('client_id') !== CLIENT || p.get('redirect_uri') !== CALLBACK || p.get('response_type') !== 'code' ||
          p.get('code_challenge_method') !== 'S256' || !PROOF.test(proof || '') || !state || state.length > 512 ||
          ![SCOPE, null, ''].includes(p.get('scope'))) return invalid();
      const id = random(6);
      await session(id).fetch('https://oauth.internal/start', { method: 'POST', body: JSON.stringify({ state, proof }) });
      return new Response(null, { status: 303, headers: { ...HEADERS, Location: `/oauth/wait/${id}` } });
    }
    if (path === '/oauth/token' && req.method === 'POST') {
      if (!/^application\/x-www-form-urlencoded(?:;|$)/i.test(req.headers.get('Content-Type') || '')) return invalid();
      const raw = await req.text();
      if (raw.length > 4096) return invalid();
      const body = new URLSearchParams(raw);
      const encoded = body.get('code');
      const verifier = body.get('code_verifier');
      if (body.get('grant_type') !== 'authorization_code' || body.get('client_id') !== CLIENT || body.get('redirect_uri') !== CALLBACK ||
          !SECRET.test(encoded || '') || !/^[a-zA-Z0-9._~-]{43,128}$/.test(verifier || '')) return invalid('invalid_grant');
      return session(encoded.slice(0, 12)).fetch('https://oauth.internal/token', { method: 'POST',
        body: JSON.stringify({ code: encoded.slice(12), proof: await challenge(verifier) }) });
    }
    const lookup = /^\/oauth\/(wait|approve)\/([a-f0-9]{12})$/.exec(path);
    if (lookup) {
      const [, action, id] = lookup;
      if (action === 'approve') {
        if (req.method !== 'POST' || !(await admin(req, env.OAUTH_APPROVAL_KEY))) return invalid('unauthorized', 401);
        return session(id).fetch('https://oauth.internal/approve', { method: 'POST' });
      }
      if (req.method !== 'GET') return invalid();
      const record = await session(id).fetch('https://oauth.internal/wait');
      if (!record.ok) return record;
      const { code, state } = await record.json();
      if (code) {
        const callback = new URL(CALLBACK);
        callback.searchParams.set('code', id + code);
        callback.searchParams.set('state', state);
        return new Response(null, { status: 303, headers: { ...HEADERS, Location: callback.href } });
      }
      return new Response(`<!doctype html><html lang="ru"><meta charset="utf-8"><meta http-equiv="refresh" content="3"><title>Вход в Мастерскую</title><h1>Подключение GPTunneL</h1><p>Передайте в чат код запроса <strong>${id}</strong>. В этой вкладке откроется GPTunneL после подтверждения.</p></html>`,
        { headers: { ...HEADERS, 'Content-Type': 'text/html; charset=utf-8', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" } });
    }
    const response = await books.fetch(req, env);
    if (response.status !== 401 || !['/mcp', '/sse'].includes(path)) return response;
    const headers = new Headers(response.headers);
    headers.set('WWW-Authenticate', `Bearer resource_metadata="${origin}/.well-known/oauth-protected-resource${path}", scope="${SCOPE}"`);
    return new Response(null, { status: 401, headers });
  }
};
