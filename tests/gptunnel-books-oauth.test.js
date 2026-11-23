import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import worker, { GptunnelOauthRequest } from '../proxy/gptunnel-books-oauth.js';

const origin = 'https://worker.example';
const returnTo = 'https://gptunnel.ru/mcp_auth2_finish.html';
const approval = 'a'.repeat(64);
const access = 'b'.repeat(64);

function createWorker() {
  const objects = new Map();
  const env = { OAUTH_APPROVAL_KEY: approval, GPTUNNEL_WORKSHOP_KEY: access, OAUTH_REQUESTS: {
    idFromName: (name) => name,
    get(id) {
      if (!objects.has(id)) {
        const values = new Map();
        values.transaction = (op) => op(values);
        values.setAlarm = async () => {};
        values.put = values.set.bind(values);
        const session = new GptunnelOauthRequest({ storage: values }, env);
        objects.set(id, { fetch: (url, init) => session.fetch(new Request(url, init)) });
      }
      return objects.get(id);
    }
  } };
  return (path, init) => worker.fetch(new Request(origin + path, init), env);
}

test('GPTunneL OAuth requires owner approval, a fixed callback, and a one-use PKCE code', async () => {
  const fetch = createWorker();
  const denied = await fetch('/sse');
  assert.equal(denied.status, 401);
  assert.match(denied.headers.get('WWW-Authenticate'), /oauth-protected-resource\/sse/);
  const verifier = 'v'.repeat(48);
  const params = { client_id: 'masterskaya-books', redirect_uri: returnTo, response_type: 'code', state: 'opaque-state',
    code_challenge_method: 'S256', code_challenge: createHash('sha256').update(verifier).digest('base64url') };
  const start = (p) => fetch(`/oauth/authorize?${new URLSearchParams(p)}`);
  assert.equal((await start({ ...params, redirect_uri: 'https://other.example/' })).status, 400);
  assert.equal((await start({ ...params, code_challenge_method: 'plain' })).status, 400);
  const initiated = await start(params);
  assert.equal(initiated.status, 303);
  const status = initiated.headers.get('Location');
  const pending = await fetch(status);
  assert.equal(pending.status, 200);
  assert.doesNotMatch(await pending.text(), new RegExp(access));
  const approve = status.replace('/wait/', '/approve/');
  assert.equal((await fetch(approve, { method: 'POST' })).status, 401);
  assert.equal((await fetch(approve, { method: 'POST', headers: { Authorization: `Bearer ${approval}` } })).status, 200);
  const done = await fetch(status);
  assert.equal(done.status, 303);
  const callback = new URL(done.headers.get('Location'));
  assert.equal(callback.origin + callback.pathname, returnTo);
  assert.equal(callback.searchParams.get('state'), params.state);
  const exchange = (proof) => fetch('/oauth/token', { method: 'POST', body: new URLSearchParams({
    grant_type: 'authorization_code', client_id: params.client_id, redirect_uri: returnTo,
    code: callback.searchParams.get('code'), code_verifier: proof
  }) });
  assert.equal((await exchange('f'.repeat(48))).status, 400);
  assert.deepEqual(await (await exchange(verifier)).json(), { token_type: 'Bearer', scope: 'books:read', access_token: access });
  assert.equal((await exchange(verifier)).status, 400);
});
