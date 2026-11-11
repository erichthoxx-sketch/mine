import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResults, judge, unwrap, searchQueries, emailsIn, rdapInfo, letterSite, letterHost, letterFormal, mailto, nextStep, piracyTodos, isLegit, findId } from '../writer/js/piracy.js';

const T = 'Звериная тропа для двоих', A = 'Лана Фрейтаг';

test('пираты: живая выдача поисковика → чужие сайты с книгой, свои площадки не считаются', () => {
  const res = parseResults(readFileSync(new URL('./fixtures/piracy-ddg.txt', import.meta.url), 'utf8'));
  assert.ok(res.some((r) => r.host === 'litnet.com'));
  const hits = res.map((r) => judge(r, T, A)).filter(Boolean);
  assert.deepEqual(hits.map((h) => h.host).sort(), ['lovereadb.ru', 'lovestorybooks.ru', 'missfantasy.ru']);
  assert.ok(hits.every((h) => h.sure));
});

test('пираты: что считать копией', () => {
  const r = (o) => ({ url: 'https://x-lib.net/b/1', host: 'x-lib.net', title: '', snip: '', ...o });
  assert.equal(judge(r({ title: `${T} — Лана Фрейтаг, читать онлайн` }), T, A).sure, true);
  // без фамилии, но «читать книгу» — показываем с просьбой проверить
  const maybe = judge(r({ title: `Читать книгу ${T}` }), T, A);
  assert.equal(maybe.sure, false); assert.match(maybe.why, /проверьте/);
  assert.equal(judge(r({ title: `Обзор: ${T}` }), T, A), null); // просто упоминание
  assert.equal(judge(r({ title: 'Другая книга Фрейтаг скачать' }), T, A), null);
  assert.equal(judge({ url: 'https://litnet.com/ru/book/x', host: 'litnet.com', title: `${T} Фрейтаг читать онлайн`, snip: '' }, T, A), null);
  assert.equal(judge(r({ title: `${T} Фрейтаг скачать` }), T, A, ['x-lib.net']), null); // «это не пират»
  assert.ok(isLegit('m.vk.com')); assert.ok(!isLegit('notvk.com'));
  assert.equal(findId('https://a.ru/1'), findId('https://a.ru/1'));
});

test('пираты: ссылки-обёртки поисковиков и запросы', () => {
  assert.equal(unwrap('//duckduckgo.com/l/?uddg=https%3A%2F%2Fpirat.ru%2Fbook%2F1&rut=abc'), 'https://pirat.ru/book/1');
  assert.equal(unwrap('https://www.bing.com/ck/a?p=1&u=a1' + Buffer.from('https://pirat.ru/b').toString('base64') + '&ntb=1'), 'https://pirat.ru/b');
  assert.equal(unwrap('javascript:alert(1)'), '');
  assert.deepEqual(searchQueries('Развод *для черной вдовы*', A), ['"Развод для черной вдовы" Фрейтаг читать онлайн бесплатно', '"Развод для черной вдовы" Фрейтаг скачать fb2']);
  const html = parseResults('<a class="r" href="https://pirat.ru/b/2"><b>Книга</b> скачать</a>');
  assert.equal(html[0].host, 'pirat.ru'); assert.equal(html[0].title, 'Книга скачать');
});

test('пираты: почты сайта и хостинга', () => {
  assert.deepEqual(emailsIn('Правообладателям: abuse [at] pirat [dot] ru, logo@2x.png, noreply@x.ru, Admin@Pirat.ru.'), ['abuse@pirat.ru', 'admin@pirat.ru']);
  const j = { name: 'RU-FORNEX', entities: [{ roles: ['registrant'], vcardArray: ['vcard', [['fn', {}, 'text', 'Fornex'], ['email', {}, 'text', 'info@fornex.com']]],
    entities: [{ roles: ['abuse'], vcardArray: ['vcard', [['email', {}, 'text', 'abuse@fornex.com']]] }] }] };
  assert.deepEqual(rdapInfo(j), { name: 'RU-FORNEX', emails: ['info@fornex.com'], abuse: ['abuse@fornex.com'] });
  assert.deepEqual(rdapInfo(null), { name: '', emails: [], abuse: [] });
});

test('пираты: письма и следующий шаг', () => {
  const f = { id: 'p1', url: 'https://pirat.ru/b/1', host: 'pirat.ru', title: T, status: 'new', foundAt: '2026-11-11T10:00:00Z' };
  const book = { title: T, link: 'https://litnet.com/ru/book/x-b1' }, me = { name: 'Иванова Анна Петровна', email: 'a@ya.ru', pen: A };
  const L = letterSite(f, book, me, '2026-11-11');
  assert.match(L.subject, /Звериная тропа/);
  for (const w of ['Иванова Анна Петровна', 'https://pirat.ru/b/1', 'https://litnet.com/ru/book/x-b1', '24 часов', '149-ФЗ', 'ст. 1301', 'псевдонимом Лана Фрейтаг']) assert.ok(L.body.includes(w), w);
  assert.match(letterSite(f, book, {}, '2026-11-11').body, /\[ФИО по паспорту\]/); // данные не заполнены — видно, что вписать
  assert.match(letterHost({ ...f, sentAt: '2026-11-11T10:00:00Z' }, book, me, '2026-11-15').body, /11\.11\.2026 я направила[\s\S]*Infringing URL: https:\/\/pirat\.ru\/b\/1/);
  assert.match(letterFormal(f, book, me, '2026-11-11').body, /паспорт \[серия, номер/);
  assert.match(mailto(['abuse@pirat.ru'], L), /^mailto:abuse%40pirat\.ru\?subject=/);
  assert.equal(nextStep(f, '2026-11-11').k, 'site');
  const sent = { ...f, status: 'sent', sentAt: '2026-11-11T10:00:00Z' };
  assert.equal(nextStep(sent, '2026-11-12').wait, true);
  assert.match(nextStep(sent, '2026-11-14').text, /написать хостингу/);
  assert.equal(nextStep({ ...sent, goneMaybe: true }, '2026-11-12').k, 'confirm');
  assert.equal(nextStep({ ...f, status: 'gone' }, '2026-11-12'), null);
  const todos = piracyTodos([f, { ...f, id: 'p2', host: 'b.ru' }, { ...sent, id: 'p3', host: 'c.ru' }, { ...f, id: 'p4', status: 'skip' }], '2026-11-14');
  assert.match(todos[0].text, /2 новые копии/);
  assert.match(todos[1].text, /c\.ru: сайт не ответил/);
  assert.equal(piracyTodos([sent], '2026-11-12').length, 0); // ждём — дела нет
});
