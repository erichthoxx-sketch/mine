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
  assert.match(q, /href="https:\/\/x\.ru"/);
  assert.match(q, /prefers-color-scheme:dark/); // тёмная тема почты
  assert.doesNotMatch(letterHtml({ book: { title: 'К', cover: 'https://x/c.jpg' } }).html, /class="tint"/); // без серой подложки
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

test('сервис писем: отложенное письмо уходит по таймеру один раз, отменённое — нет', async () => {
  const { sent } = stub();
  Object.assign(process.env, { BUCKET: 'b', ADMIN_KEY: 'k', FROM: 'Лана <hello@lanafreitag.ru>', REPLY_TO: 'me@ya.ru', SITE: 'https://lanafreitag.ru/', SELF: 'https://f/x' });
  delete require.cache[require.resolve('../mail/mail-function.cjs')];
  const { handler } = require('../mail/mail-function.cjs');
  const ctx = { token: { access_token: 't' } };
  const adm = (b) => handler({ httpMethod: 'POST', queryStringParameters: { a: 'admin' }, headers: {}, body: JSON.stringify({ key: 'k', ...b }) }, ctx).then((r) => JSON.parse(r.body));
  await adm({ op: 'import', list: [{ email: 'a@ya.ru' }, { email: 'b@ya.ru' }] });
  const past = new Date(Date.now() - 60e3).toISOString(), future = new Date(Date.now() + 864e5).toISOString();
  await adm({ op: 'schedule', id: 'p1', at: past, subject: 'Вышел роман', html: '<p>x {unsub}</p>', text: 'x', draft: { title: 'X' } });
  await adm({ op: 'schedule', id: 'p2', at: future, subject: 'Завтра', html: 'y', text: 'y' });
  await adm({ op: 'schedule', id: 'p3', at: past, subject: 'Отменю', html: 'z', text: 'z' });
  let L = await adm({ op: 'unschedule', id: 'p3' });
  assert.deepEqual(L.queue.map((q) => q.id), ['p1', 'p2']);
  assert.equal(L.queue[0].html, undefined); // в списке — без вёрстки
  const tick = () => handler({ messages: [{ event_metadata: { event_type: 'yandex.cloud.events.serverless.triggers.TimerMessage' } }] }, ctx);
  await tick(); await tick();
  const mine = sent.filter((m) => m.Content.Simple.Subject.Data === 'Вышел роман');
  assert.equal(mine.length, 2); // обеим — и только один раз
  assert.equal(sent.some((m) => /Отменю|Завтра/.test(m.Content.Simple.Subject.Data)), false);
  L = await adm({ op: 'list' });
  assert.deepEqual(L.queue.map((q) => q.id), ['p2']);
  assert.equal(L.sent.at(-1).sent, 2);
  assert.equal(L.sent.at(-1).draft.title, 'X');
  assert.ok(L.tick); // копия адресов за день сделана
});

test('шаблон письма: копия для приложений совпадает с site/letter.js', async () => {
  const fs = await import('node:fs');
  const a = fs.readFileSync(new URL('../site/letter.js', import.meta.url), 'utf8');
  const b = fs.readFileSync(new URL('../js/letter.js', import.meta.url), 'utf8');
  assert.equal(b.split('\n').slice(1).join('\n'), a); // первая строка — пометка «копия»
});

test('почта: цифры, рост по дням, таблица, поиск, подсказки «когда отправить»', async () => {
  const { subsStats, subsSeries, subsCsv, filterSubs, sendSlots, localIso, localParts } = await import('../js/mailcalc.js');
  const list = [
    { email: 'a@ya.ru', name: 'Анна', status: 'ok', at: '2026-10-20T10:00:00Z', okAt: '2026-10-20T10:05:00Z', src: 'glavnaya' },
    { email: 'b@ya.ru', status: 'ok', at: '2026-10-28T10:00:00Z', src: 'firebase' }, // перенесена — считается с at
    { email: 'c@ya.ru', status: 'unsub', at: '2026-10-21T10:00:00Z', okAt: '2026-10-21T11:00:00Z', unsubAt: '2026-10-30T09:00:00Z' },
    { email: 'd@ya.ru', status: 'pending', at: '2026-10-31T10:00:00Z' },
  ];
  assert.deepEqual(subsStats(list, '2026-11-01'), { ok: 2, wait: 1, unsub: 1, new30: 3, gone30: 1 });
  const s = subsSeries(list, '2026-11-01', 90);
  assert.equal(s[0].date, '2026-10-19'); // за день до первой
  assert.equal(s[0].value, 0);
  assert.equal(s.find((x) => x.date === '2026-10-29').value, 3);
  assert.equal(s.at(-1).value, 2); // отписавшаяся ушла
  const csv = subsCsv(list);
  assert.ok(csv.startsWith('﻿"Почта";"Имя"'));
  assert.match(csv, /"a@ya.ru";"Анна";"подтвердила";"2026-10-20"/);
  assert.deepEqual(filterSubs(list, { q: 'анна', status: 'all' }).map((p) => p.email), ['a@ya.ru']);
  assert.deepEqual(filterSubs(list, {}).map((p) => p.email), ['b@ya.ru', 'a@ya.ru']); // свежие сверху
  const planned = (b) => b.p || [];
  const slots = sendSlots([{ title: 'Книга', p: [{ ch: 'Глава 1', pf: 'Литнет', date: '2026-11-05' }] }], { books: [{ title: 'Книга', startDate: '2026-11-20' }] }, '2026-11-01', planned);
  assert.deepEqual(slots.map((x) => x.date), ['2026-11-05', '2026-11-20']);
  assert.match(slots[0].label, /Выход «Глава 1»/);
  // старт выкладки по плану (глава ещё не на таймере) и книга письма — первой
  const wb = [{ title: 'Звериная тропа', p: [{ ch: 'Глава 23', pf: 'Литнет', date: '2026-11-02' }] }, { title: 'Развод для черной вдовы', publishStart: '2026-11-09', p: [] }];
  const s2 = sendSlots(wb, null, '2026-11-01', planned, { focus: 'Развод для чёрной вдовы' });
  assert.deepEqual(s2.map((x) => [x.date, x.label]), [['2026-11-09', 'Первая глава · Развод для черной вдовы'], ['2026-11-02', 'Выход «Глава 23» · Звериная тропа']]);
  assert.deepEqual(sendSlots(wb, null, '2026-11-01', planned).map((x) => x.date), ['2026-11-02', '2026-11-09']);
  assert.deepEqual(localParts(localIso('2026-11-05', '10:30')), { date: '2026-11-05', time: '10:30' });
});
