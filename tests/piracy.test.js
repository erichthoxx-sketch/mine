import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseResults, judge, unwrap, searchQueries, emailsIn, rdapInfo, letterSite, letterHost, letterFormal, mailto, nextStep, piracyTodos, isLegit, findId, hostContactRoute, isProxyNetwork, authorIdOf, knownLitnetAuthorId } from '../writer/js/piracy.js';

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
  assert.deepEqual(searchQueries('Развод *для черной вдовы*', A), ['"Развод для черной вдовы" Фрейтаг читать онлайн бесплатно', '"Развод для черной вдовы" Фрейтаг скачать fb2', '"Развод для черной вдовы" Фрейтаг читать полностью', '"Развод для черной вдовы" Фрейтаг epub txt pdf', '"Развод для черной вдовы" Фрейтаг']);
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

test('пираты: регистратор и CDN не становятся хостингом автоматически', async () => {
  const fresh = { v: 2, ip: '203.0.113.8', host: ['abuse@ip-host.net'], hostName: 'Example Network', reg: ['abuse@registrar.ru'], regName: 'Registrar' };
  assert.deepEqual(hostContactRoute(fresh).to, ['abuse@ip-host.net']);
  assert.ok(!hostContactRoute(fresh).to.includes('abuse@registrar.ru'));
  const same = { ...fresh, host: ['abuse@registrar.ru'] };
  assert.equal(hostContactRoute(same).kind, 'overlap');
  assert.deepEqual(hostContactRoute(same).to, []);
  const onlyReg = { ...fresh, host: [] };
  assert.equal(hostContactRoute(onlyReg).kind, 'missing');
  assert.deepEqual(hostContactRoute(onlyReg).to, []);
  assert.equal(hostContactRoute({ host: fresh.host, reg: fresh.reg }).kind, 'stale');
  assert.equal(hostContactRoute({ ...fresh, proxy: true }).kind, 'proxy');
  assert.equal(hostContactRoute({ ...fresh, hostName: 'CLOUDFLARENET' }).kind, 'proxy');
  assert.ok(isProxyNetwork('DDoS-Guard CDN'));
  assert.ok(isProxyNetwork('Fastly'));
  assert.deepEqual(hostContactRoute({ ...fresh, hostName: 'Fastly, Inc.' }).to, []);
  const { registeredDomain } = await import('../writer/js/piracyscan.js');
  assert.equal(registeredDomain('books.example.co.uk'), 'example.co.uk');
  assert.equal(registeredDomain('reader.example.ru'), 'example.ru');
});

test('пираты: ID автора из реального профиля, списка книг и безопасный резерв', () => {
  assert.equal(knownLitnetAuthorId('Лана Фрейтаг'), '11343252');
  assert.equal(knownLitnetAuthorId('Другой автор'), '');
  assert.equal(authorIdOf('https://litnet.com/ru/lana-freitag-u11343252'), '11343252');
  const page = [
    '[Другая автор](https://litnet.com/ru/other-u998877)',
    '[Лана Фрейтаг](https://litnet.com/ru/lana-freitag-u11343252)',
    '[Комментарий](https://litnet.com/ru/visitor-u889977)',
  ].join('\n');
  assert.equal(authorIdOf(page, 'Лана Фрейтаг'), '11343252');
  assert.equal(authorIdOf(page, 'Неизвестный автор'), '');
  assert.equal(authorIdOf('555777', 'Лана Фрейтаг'), '555777');
});

test('пираты: письма и следующий шаг', () => {
  const f = { id: 'p1', url: 'https://pirat.ru/b/1', host: 'pirat.ru', title: T, status: 'new', foundAt: '2026-11-11T10:00:00Z' };
  const book = { title: T, link: 'https://litnet.com/ru/book/x-b1' }, me = { name: 'Иванова Анна Петровна', email: 'a@ya.ru', pen: A };
  const L = letterSite(f, book, me, '2026-11-11');
  assert.match(L.subject, /^ДОСУДЕБНАЯ ПРЕТЕНЗИЯ: .*Звериная тропа/);
  for (const w of ['Я, Лана Фрейтаг, — автор и правообладатель', 'https://pirat.ru/b/1', 'https://litnet.com/ru/book/x-b1', '24 часов', '149-ФЗ', 'ст. 1301', 'ст. 146 УК РФ', 'ст. 15.2', 'досудебного порядка', 'ознакомительные фрагменты', 'ст. 1274', 'моим именем (псевдонимом)']) assert.ok(L.body.includes(w), w);
  assert.ok(!L.body.includes('Иванова') && !/ФИО/.test(L.body)); // без настоящего имени — только псевдоним
  const H = letterHost({ ...f, sentAt: '2026-11-11T10:00:00Z' }, book, me, '2026-11-15').body;
  assert.match(H, /11\.11\.2026 владельцу сайта направлена досудебная претензия[\s\S]*Infringing URL: https:\/\/pirat\.ru\/b\/1/);
  assert.ok(!H.includes('Иванова'));
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

test('«Это не пират»: вернулся полный текст — находка снова новая; спрятанные проверяются раз в 3 дня', async () => {
  const { fullTextBack, skipToRecheck } = await import('../writer/js/piracy.js');
  assert.equal(fullTextBack(8000, 9000), false); // меню поменялось — не повод
  assert.equal(fullTextBack(8000, 30000), true); // выложили главы
  assert.equal(fullTextBack(40000, 52000), false); // мало прибавилось
  assert.equal(fullTextBack(0, 300000), false); // нет запомненного объёма — сначала запоминаем
  const now = Date.parse('2026-11-12T12:00:00Z');
  const finds = [
    { id: 'a', status: 'skip', url: 'https://x.ru/1', skipCheckAt: '2026-11-11T12:00:00Z' },
    { id: 'b', status: 'skip', url: 'https://x.ru/2', skipCheckAt: '2026-11-01T12:00:00Z' },
    { id: 'c', status: 'skip', url: 'https://x.ru/3' },
    { id: 'd', status: 'new', url: 'https://x.ru/4' },
  ];
  assert.deepEqual(skipToRecheck(finds, now).map((f) => f.id), ['c', 'b']);
});

test('пираты: шаг «Литнет» после поисковиков, «Нет, висит», ссылка на форму и ID автора', async () => {
  const { nextStep, litnetFormUrl, authorIdOf } = await import('../writer/js/piracy.js');
  const T = '2026-11-16';
  assert.equal(nextStep({ status: 'search', searchAt: '2026-11-10' }, T).k, 'litnet');
  assert.equal(nextStep({ status: 'search', litnetAt: '2026-11-12' }, T).k, 'done');
  assert.equal(nextStep({ status: 'sent', sentAt: '2026-11-13', goneMaybe: true }, T).k, 'confirm');
  assert.equal(nextStep({ status: 'sent', sentAt: '2026-11-10', goneMaybe: true, stillAt: '2026-11-15' }, T).k, 'host'); // сказала «висит» — дальше по цепочке
  assert.equal(nextStep({ status: 'sent', sentAt: '2026-11-01', goneMaybe: true, stillAt: '2026-11-05' }, T).k, 'confirm'); // через неделю снова спросим
  const u = new URL(litnetFormUrl({ authorId: 'u123456', title: 'Развод *для* вдовы', pen: 'Лана Фрейтаг', urls: ['https://a.ru/1', 'https://b.ru/2'] }));
  assert.equal(u.searchParams.get('entry.1095341742'), '123456');
  assert.equal(u.searchParams.get('entry.147382409'), 'Развод для вдовы');
  assert.equal(u.searchParams.get('entry.1437517371'), 'https://a.ru/1\nhttps://b.ru/2');
  const page = 'Title: Пышка — автора Ася Коваль\n[чужой](https://litnet.com/ru/other-u111)\n[![Аватар](x.png) Ася Коваль Автор • 11 книг](https://litnet.com/ru/asya-koval-u13021984)';
  assert.equal(authorIdOf(page, 'Ася Коваль'), '13021984');
  assert.equal(authorIdOf('https://litnet.com/ru/lana-freitag-u987654', ''), '987654');
  assert.equal(authorIdOf(' 555777 '), '555777');
});

test('поиск из браузера: по 2 запроса книги в день по кругу — за 3 дня все 5', async () => {
  const { dayQueries } = await import('../writer/js/piracyscan.js');
  const qs = ['a', 'b', 'c', 'd', 'e'];
  assert.deepEqual(dayQueries(qs, 0), ['a', 'b']);
  assert.deepEqual(new Set([0, 1, 2].flatMap((d) => dayQueries(qs, d))).size, 5);
  assert.deepEqual(dayQueries(['x', 'y'], 7), ['x', 'y']);
});
