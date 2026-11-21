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
