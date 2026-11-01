import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { letterHtml } from '../site/letter.js';

const require = createRequire(import.meta.url);

// заглушки Object Storage и Postbox: что «лежит» в бакете и что «ушло» письмами
function stub() {
  const files = {}, sent = [];
  globalThis.fetch = async (url, o = {}) => {
    const u = String(url);
    if (u.startsWith('https://storage.yandexcloud.net/')) {
      const key = u.split('/').slice(4).join('/');
      if (o.method === 'PUT') { files[key] = typeof o.body === 'string' ? o.body : '[bin]'; return { ok: true, status: 200 }; }
      return key in files ? { ok: true, status: 200, json: async () => JSON.parse(files[key]) } : { ok: false, status: 404 };
    }
    if (u.startsWith('https://postbox.cloud.yandex.net/')) { sent.push(JSON.parse(o.body)); return { ok: true, status: 200, text: async () => '' }; }
    throw new Error('неожиданный адрес ' + u);
  };
  Object.assign(process.env, { BUCKET: 'lana-mail', ADMIN_KEY: 'секрет', FROM: 'Лана <hello@lanafreitag.ru>', REPLY_TO: 'lana@mail.ru', SITE: 'https://lanafreitag.ru/', SELF: 'https://functions.yandexcloud.net/f1' });
  return { files, sent };
}
const call = (h, q, body, method = 'POST') => h({ httpMethod: method, queryStringParameters: q, headers: { Origin: 'https://lanafreitag.ru' }, body: body ? JSON.stringify(body) : '' }, { token: { access_token: 't' } });

test('сервис писем: подписка → подтверждение → письмо всем → отписка', async () => {
  const { files, sent } = stub();
  const { handler } = require('../mail/mail-function.cjs');
  let r = await call(handler, { a: 'sub' }, { email: 'Anna@Mail.ru', ok: true, src: 'glavnaya' });
  assert.equal(r.statusCode, 200);
  assert.equal(r.headers['Access-Control-Allow-Origin'], 'https://lanafreitag.ru');
  assert.equal(sent[0].Content.Simple.Subject.Data, 'Подтвердите подписку');
  const p = JSON.parse(files['subs.json']).list[0];
  assert.equal(p.email, 'anna@mail.ru'); assert.equal(p.status, 'pending');
  assert.equal((await call(handler, { a: 'sub' }, { email: 'x@y.ru' })).statusCode, 400); // без согласия — нет
  r = await call(handler, { a: 'confirm', t: p.token }, null, 'GET');
  assert.equal(r.statusCode, 302); assert.match(r.headers.Location, /pismo=ok/);
  assert.equal((await call(handler, { a: 'admin' }, { key: 'не тот', op: 'list' })).statusCode, 403);
  const L = letterHtml({ title: 'Новый роман', text: 'Привет.\n\nВыходит книга.', book: { title: 'Книга', url: 'https://lanafreitag.ru/?kniga=x' } });
  r = await call(handler, { a: 'admin' }, { key: 'секрет', op: 'send', subject: 'Новый роман', html: L.html, text: L.text });
  assert.equal(JSON.parse(r.body).sent, 1);
  const last = sent.at(-1);
  assert.deepEqual(last.Destination.ToAddresses, ['anna@mail.ru']);
  assert.match(last.Content.Simple.Body.Html.Data, new RegExp(`a=unsub&t=${p.token}`)); // у каждой — своя ссылка «Отписаться»
  r = await call(handler, { a: 'unsub', t: p.token }, null, 'GET');
  assert.match(r.headers.Location, /pismo=unsub/);
  r = await call(handler, { a: 'admin' }, { key: 'секрет', op: 'send', subject: 'Ещё', html: L.html, text: L.text });
  assert.equal(JSON.parse(r.body).sent, 0); // отписавшимся больше не пишем
  r = await call(handler, { a: 'admin' }, { key: 'секрет', op: 'import', list: [{ email: 'old@ya.ru' }, { email: 'anna@mail.ru' }] });
  assert.equal(JSON.parse(r.body).added, 1);
  r = await call(handler, { a: 'admin' }, { key: 'секрет', op: 'send', test: true, subject: 'Проба', html: L.html, text: L.text });
  assert.deepEqual(sent.at(-1).Destination.ToAddresses, ['lana@mail.ru']); // пробное — только владелице
});

test('письмо: обложка, абзацы, кнопка и ссылка отписки', () => {
  const { html, text } = letterHtml({ title: 'Развод *для черной вдовы*', text: 'Первый.\n\nВторой.', book: { title: 'Развод', cover: 'https://x/c.jpg', url: 'https://lanafreitag.ru/?kniga=r' }, btn: 'Читать' });
  assert.match(html, /font-style:italic[^>]*>для черной вдовы<\/span>/); // курсив заголовка — тонким шрифтом, как на сайте
  const q = letterHtml({ text: 'Это **важно** и [тут](https://x.ru)', quote: 'Цитата', sign: '', design: { bear: false, sign: 'Лана', footer: '' } }).html;
  assert.match(q, /<b>важно<\/b>/);
  assert.match(q, /<a href="https:\/\/x\.ru"/);
  assert.match(q, />Лана</); // подпись из оформления
  assert.doesNotMatch(q, /mail-bear/); // медведя выключили
  assert.match(html, /src="https:\/\/x\/c\.jpg"/);
  assert.equal((html.match(/Второй\./g) || []).length, 1);
  assert.match(html, /href="\{unsub\}"/);
  assert.match(text, /Читать: https:\/\/lanafreitag\.ru\/\?kniga=r/);
});

test('сайт: подписка идёт в сервис писем, если он подключён; иначе — как раньше', async () => {
  const { subscribe } = await import('../site/data.js');
  const calls = [];
  globalThis.fetch = async (url, o = {}) => { calls.push({ url: String(url), body: JSON.parse(o.body) }); return { ok: true, status: 200, json: async () => ({ ok: true }) }; };
  const r = await subscribe({ mailUrl: 'https://functions.yandexcloud.net/abc' }, 'a@b.ru', 'glavnaya', 'Анна');
  assert.equal(calls[0].url, 'https://functions.yandexcloud.net/abc?a=sub');
  assert.deepEqual(calls[0].body, { email: 'a@b.ru', ok: true, src: 'glavnaya', name: 'Анна' });
  assert.equal(r.confirm, true);
  globalThis.fetch = async (url) => { calls.push({ url: String(url) }); return { ok: true, status: 200, json: async () => ({ ok: true, already: true }) }; };
  assert.equal((await subscribe({ mailUrl: 'https://x.ru/f' }, 'a@b.ru', 'glavnaya')).confirm, false); // уже подтвердила
  globalThis.fetch = async (url) => { calls.push({ url: String(url) }); return { ok: true, status: 200 }; };
  await subscribe({ mailUrl: '' }, 'c@d.ru', 'glavnaya');
  assert.match(calls.at(-1).url, /firestore\.googleapis\.com.*site_subs/);
});
