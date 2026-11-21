import test from 'node:test';
import assert from 'node:assert/strict';
import gateway from '../proxy/freitag-polza-worker.js';

test('health check reveals configuration status, not secrets', async () => {
  const response = await gateway.fetch(new Request('https://example.workers.dev/health'), {});
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.configured, false);
  assert.equal(data.booksConnected, false);
  assert.equal(data.model, 'anthropic/claude-opus-5.5');
});

test('rejects unauthorized paid request before accessing provider', async () => {
  const request = new Request('https://example.workers.dev/chat', {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://erichthoxx-sketch.github.io' },
    body: JSON.stringify({ messages: [{ role: 'user', content: 'Привет' }] })
  });
  const response = await gateway.fetch(request, { POLZA_API_KEY: 'dummy' });
  assert.equal(response.status, 401);
  assert.match((await response.json()).error, /Требуется вход/);
});

test('rejects disallowed browser origins', async () => {
  const request = new Request('https://example.workers.dev/health', { headers: { Origin: 'https://untrusted.example' } });
  const response = await gateway.fetch(request, {});
  assert.equal(response.status, 403);
  assert.equal(response.headers.get('access-control-allow-origin'), null);
});

test('existing books namespace enables access without old MCP secret', async () => {
  const response = await gateway.fetch(new Request('https://example.workers.dev/health'), {
    POLZA_API_KEY: 'dummy', OWNER_UID: 'owner-id',
    BOOKS: { async get() { return null; } }
  });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.configured, true);
  assert.equal(data.booksConnected, true);
});

test('canon query is compact and provider 402 remains 402 with trace identifier', async () => {
  const now = Math.floor(Date.now() / 1000);
  const { publicKey, privateKey } = await crypto.subtle.generateKey(
    { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1,0,1]), hash: 'SHA-256' },
    true, ['sign', 'verify']);
  const jwk = { ...await crypto.subtle.exportKey('jwk', publicKey), kid: 'test-key' };
  const encoded = value => Buffer.from(JSON.stringify(value)).toString('base64url');
  const h = encoded({ alg: 'RS256', kid: jwk.kid });
  const p = encoded({ aud: 'dohody-6d6dd', iss: 'https://securetoken.google.com/dohody-6d6dd',
    sub: 'owner-test', user_id: 'owner-test', iat: now, exp: now + 3600 });
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(h+'.'+p));
  const token = h+'.'+p+'.'+Buffer.from(signature).toString('base64url');
  const originalFetch = globalThis.fetch;
  let sent;
  globalThis.fetch = async (url, opts) => {
    if (String(url).includes('googleapis.com')) return Response.json({ keys: [jwk] });
    if (String(url).includes('polza.ai')) {
      sent = JSON.parse(opts.body);
      return Response.json({ error: { message: 'insufficient reserve',
        trace_id: 'abcdef-123456' } }, { status: 402 });
    }
    throw Error('Unexpected request '+url);
  };
  try {
    const book={ context:'CANON'.repeat(24000), updatedAt:new Date().toISOString(), chapters:[
      {title:'1',text:'hello'},{title:'2',text:'OLD'.repeat(30000)},
      {title:'3',text:'RECENT'.repeat(30000)}
    ]};
    const response=await gateway.fetch(new Request('https://example.workers.dev/chat',{
      method:'POST',headers:{'Content-Type':'application/json','Authorization':'Bearer '+token,
        Origin:'https://freitag-ai-test.pages.dev'},
      body:JSON.stringify({messages:[{role:'system',content:'Writer style'},{role:'user',content:'Events?'}],
        mode:'canon',bookId:'book-1'})
    }),{OWNER_UID:'owner-test', POLZA_API_KEY:'dummy',BOOKS:{
      async get(k){ assert.equal(k,'book:book-1');return book; }
    }});
    assert.equal(response.status,402);
    const data=await response.json();
    assert.equal(data.trace_id,'abcdef-123456');
    assert.doesNotMatch(data.error,/insufficient reserve/);
    assert.equal(sent.max_tokens,1300);
    assert.match(sent.messages[0].content,/CANON/);
    assert.ok(sent.messages[0].content.length < 60000,'must not send 120k-character canon');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
