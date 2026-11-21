import test from 'node:test';
import assert from 'node:assert/strict';
import { onRequest } from '../functions/api/freitag/[route].js';

function request(path, init={}) {
  return new Request('https://freitag-ai-test.pages.dev/api/freitag/'+path, init);
}
test('Pages proxy explains missing binding without triggering a paid request', async () => {
  const res=await onRequest({ params:{route:'chat'}, request: request('chat',{
    method:'POST',headers:{Authorization:'Bearer private'},body:'{}'
  }), env:{} });
  assert.equal(res.status,503);
  const {error}=await res.json();
  assert.match(error,/FREITAG_GATEWAY/);
});
test('Pages proxy health uses service binding, not a cross-origin browser request', async () => {
  let seen;
  const res=await onRequest({params:{route:'health'},request:request('health'),env:{
    FREITAG_GATEWAY:{async fetch(r){
      seen=r;
      return Response.json({ok:true,configured:true,booksConnected:true});
    }}
  }});
  assert.equal(seen.url,'https://freitag-opus-gateway.erichtho-xx.workers.dev/health');
  assert.equal(seen.headers.has('Origin'),false);
  assert.equal(res.status,200);
  assert.equal((await res.json()).booksConnected,true);
});
test('Pages proxy preserves Firebase bearer and upstream billing status', async () => {
  let sent;
  const res=await onRequest({params:{route:'chat'},request:request('chat',{
    method:'POST',headers:{Authorization:'Bearer firebase-test',Origin:'https://freitag-ai-test.pages.dev'},
    body:'{"messages":[]}'
  }),env:{FREITAG_GATEWAY:{async fetch(r){
    sent=r;
    return Response.json({error:'Polza: недостаточно средств для резерва'},{status:402});
  }}}});
  assert.equal(sent.headers.get('authorization'),'Bearer firebase-test');
  assert.equal(sent.headers.get('origin'),null);
  assert.equal(res.status,402);
  assert.match((await res.json()).error,/Polza/);
});
