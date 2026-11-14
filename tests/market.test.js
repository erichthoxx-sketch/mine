import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parseLitnetList, packDay, bookCard, marketInsights, tropesOf, trimSnap, litnetId } from '../js/market.js';
import { okSrc } from '../direct/js/marketscan.js';

const rows = parseLitnetList(readFileSync(new URL('./fixtures/market-litnet.txt', import.meta.url), 'utf8'));

test('рынок: страница топа Литнета → карточки книг', () => {
  assert.equal(rows.length, 16);
  const b = rows.find((r) => r.title.startsWith('Криминальный босс'));
  assert.equal(b.author, 'Арина Арская'); assert.equal(b.id, '604714'); assert.equal(litnetId(b.url), '604714');
  assert.equal(b.views, 1500000); assert.equal(b.lib, 15400); assert.equal(b.likes, 2500); assert.equal(b.pages, 246);
  assert.equal(b.price, 149); assert.equal(b.status, 'progress'); assert.equal(b.excl, true);
  assert.ok(b.tropes.includes('Босс') && b.tropes.includes('Криминал'));
  const free = rows.find((r) => r.title === 'Ласточкино гнездо'); assert.equal(free.price, 0); assert.equal(free.excl, false);
  const off = rows.find((r) => r.title === 'Встреча одноклассников'); assert.equal(off.full, 159); assert.equal(off.price, 131.97); assert.equal(off.off, 17);
});
test('рынок: тропы по началам слов, без ложных', () => {
  assert.deepEqual(tropesOf('Развод. Бывший муж вернулся'), ['Развод', 'Бывшие', 'Второй шанс']);
  assert.ok(!tropesOf('Она богата духом').includes('Миллиардер'));
});
test('рынок: выводы — тропы, цена, взлёты, новички и выпавшие', () => {
  const books = Object.fromEntries(rows.map((r) => [r.id, bookCard(r)]));
  const cur = packDay(rows.slice(0, 14)), prev = packDay(rows.slice(2, 16)).map((r) => ({ ...r, l: r.l - 700 }));
  const snap = { days: { '2026-11-05': { a: prev }, '2026-11-12': { a: cur } }, books };
  const M = marketInsights(snap, { mine: ['Развод'] });
  assert.equal(M.n, 14); assert.equal(M.prevDate, '2026-11-05'); assert.equal(M.gap, 7);
  assert.equal(M.movers[0].perDay, 100);
  assert.deepEqual(M.fresh.map((b) => b.title), ['Плохой сводный', 'Жажду. Твой. Взгляд']);
  assert.equal(M.gone.length, 2);
  assert.equal(M.price.median, 154);
  assert.ok(M.tropes[0].n >= M.tropes[1].n);
  assert.ok(M.notes.some((n) => n.includes('Ваши тропы')) && M.notes.some((n) => n.includes('Обычная цена')));
  // первый срез — без сравнения
  const one = marketInsights({ days: { '2026-11-12': { a: cur } }, books });
  assert.equal(one.prevDate, null); assert.equal(one.movers.length, 0);
  assert.equal(marketInsights({}), null);
  // лишние дни и карточки чистятся
  const t = trimSnap({ days: { ...snap.days, '2026-11-13': { a: cur.slice(0, 1) } }, books }, 1);
  assert.deepEqual(Object.keys(t.days), ['2026-11-13']); assert.equal(Object.keys(t.books).length, 1);
});
test('рынок: подборка — только страница топа Литнета', () => {
  assert.ok(okSrc('https://litnet.com/ru/top/lyubovnye-romany'));
  assert.ok(!okSrc('https://litnet.com/ru/book/x-b1')); assert.ok(!okSrc('https://evil.ru/ru/top/all'));
});
test('рынок: «в топе при малом числе читателей» — библиотек меньше 5 % от обычного', () => {
  const r = parseLitnetList(readFileSync(new URL('./fixtures/market-litnet-odd.txt', import.meta.url), 'utf8'));
  const M = marketInsights({ days: { '2026-11-12': { a: packDay(r) } }, books: Object.fromEntries(r.map((x) => [x.id, bookCard(x)])) });
  assert.deepEqual(M.odd.map((b) => b.title), ['Секретарша для большого босса', 'Пышка для босса', 'Мажор для училки', 'Горячая булочка для босса']);
  assert.ok(M.notes.some((n) => n.includes('с очень малым числом читателей')));
});
test('рынок: письмо за неделю — только когда есть с чем сравнить', async () => {
  const { marketDigest } = await import('../js/market.js');
  const books = Object.fromEntries(rows.map((r) => [r.id, bookCard(r)]));
  const cur = packDay(rows.slice(0, 14)), prev = packDay(rows.slice(2, 16)).map((r) => ({ ...r, l: r.l - 700 }));
  assert.equal(marketDigest(marketInsights({ days: { '2026-11-12': { a: cur } }, books })), '');
  const t = marketDigest(marketInsights({ days: { '2026-11-05': { a: prev }, '2026-11-12': { a: cur } }, books }, { mine: ['Развод'] }), { myTropes: ['Развод'] });
  assert.match(t, /Топы Литнета: 05\.11 → 12\.11\./); assert.match(t, /Быстрее всех набирают читателей/); assert.match(t, /\+100 — «/); assert.match(t, /Новые в топе: «Плохой сводный»/);
});
test('рынок: авторы с серией в топе и сравнение её цен с обычной ценой', () => {
  const r = parseLitnetList(readFileSync(new URL('./fixtures/market-litnet-odd.txt', import.meta.url), 'utf8'));
  const snap = { days: { '2026-11-12': { a: packDay(r) } }, books: Object.fromEntries(r.map((x) => [x.id, bookCard(x)])) };
  const M = marketInsights(snap, { myPrices: [99, 109] });
  assert.equal(M.authors[0].name, 'Ася Коваль'); assert.equal(M.authors[0].n, 3);
  assert.ok(M.notes.some((n) => /Ваши цены \(104 ₽\) ниже обычной цены топа/.test(n)));
  assert.ok(!marketInsights(snap).notes.some((n) => n.includes('Ваши цены')));
});
test('рынок: карта тропов, цены, объём и подача — аналитика поверх топа', () => {
  const r = parseLitnetList(readFileSync(new URL('./fixtures/market-litnet-odd.txt', import.meta.url), 'utf8'));
  const all = [...rows, ...r.filter((x) => !rows.some((y) => y.id === x.id))];
  const M = marketInsights({ days: { '2026-11-12': { a: packDay(all) } }, books: Object.fromEntries(all.map((x) => [x.id, bookCard(x)])) });
  assert.ok(M.tropeMap.length >= 5 && M.tropeMap.every((t) => t.n >= 3 && ['niche', 'hot', 'tired', 'weak', 'even'].includes(t.verdict)));
  assert.ok(M.tropeMap[0].interest >= M.tropeMap[M.tropeMap.length - 1].interest);
  assert.equal(M.prices.reduce((s, b) => s + b.n, 0), all.filter((x) => x.price != null).length);
  assert.ok(M.sizes.length >= 2 && M.pairs.every((p) => p.n >= 3));
  assert.ok(M.pitch.dialogue > 0.3 && M.pitch.dialogue < 0.8);
  assert.ok(M.formula.pages > 50 && M.formula.conv > 0);
});

test('её книга против топа: тропы, соседи и линия доли тропа', async () => {
  const m = await import('../js/market.js');
  const mk = (id, t, an, l, v, p) => [{ id, n: Number(id), l, v, p, g: 150, k: 10 }, { t, a: 'А' + id, u: 'https://litnet.com/ru/book/x-b' + id, tr: m.tropesOf(t + '. ' + an), an }];
  const src = [mk('1', 'Развод. Вернуть жену', '— Ты уйдешь', 9000, 90000, 149), mk('2', 'Развод по-взрослому', 'Он изменил', 8000, 60000, 149), mk('3', 'После развода', 'Бандит и криминал', 7000, 50000, 159),
    mk('4', 'Босс', 'Мой начальник', 1000, 50000, 149), mk('5', 'Мой босс', 'шеф', 1200, 60000, 0), mk('6', 'Босс и я', 'начальник', 900, 45000, 139)];
  const snap = { days: { '2026-11-01': { x: src.slice(3).map((x) => x[0]) }, '2026-11-07': { x: src.slice(1).map((x) => x[0]) }, '2026-11-13': { x: src.map((x) => x[0]) } }, books: Object.fromEntries(src.map((x) => [x[0].id, x[1]])) };
  const M = m.marketInsights(snap, { myBooks: [{ id: 'b', title: 'Развод для черной вдовы', tags: ['криминал'], ann: 'Описание', price: 129 }] });
  const f = M.fit[0];
  assert.deepEqual(f.tropes.map((t) => t.name).sort(), ['Криминал', 'Развод']);
  assert.equal(f.tropes.find((t) => t.name === 'Развод').verdict, 'hot');
  assert.equal(f.near[0].id, '3'); // оба тропа сразу
  assert.ok(f.lines.some((l) => /«Развод» сейчас читают охотнее/.test(l)));
  assert.ok(f.lines.some((l) => /«Криминал» в топе почти нет/.test(l)));
  assert.deepEqual(M.tropeMap.find((t) => t.name === 'Развод').hist.map((x) => +x.toFixed(2)), [0, 0.4, 0.5]);
  assert.equal(M.all.length, 6);
});

test('рынок: место её книг, соперницы и рост тропов', async () => {
  const m = await import('../js/market.js');
  const snap = { books: { a: { t: 'Моя книга', a: 'Лана Фрейтаг' }, b: { t: 'Чужая', a: 'Анна', u: 'u' }, c: { t: 'Новая', a: 'Анна', u: 'u2' } },
    my: { '2026-11-01': { s: [{ id: 'a', n: 90, l: 10 }] }, '2026-11-08': { s: [{ id: 'a', n: 60, l: 30 }] }, '2026-11-09': { s: [{ id: 'a', n: 55, l: 40 }] } },
    days: { '2026-11-08': { s: [{ id: 'b', n: 1, p: 149, f: 149, o: 0, l: 10 }] }, '2026-11-09': { s: [{ id: 'b', n: 2, p: 119, f: 149, o: 20, l: 20 }, { id: 'c', n: 5, p: 159, f: 159, o: 0, l: 5 }] } } };
  const r = m.myRanks(snap, { names: { s: 'Любовные романы' } });
  assert.equal(r[0].now, 55); assert.equal(r[0].was, 90); assert.equal(r[0].best, 55); assert.equal(r[0].hist.length, 3);
  const w = m.watchReport(snap, ['Анна'])[0];
  assert.deepEqual(w.events.map((e) => e.kind).sort(), ['new', 'sale']);
  assert.equal(w.books[0].n, 2);
  const t = m.trimSnap(snap, 1); assert.deepEqual(Object.keys(t.my), ['2026-11-09']); assert.ok(t.books.a);
});

test('прогноз тропов: растущий по новым книгам и тренду — «вверх», уходящий — «вниз»', async () => {
  const m = await import('../js/market.js');
  const books = {}, days = {};
  for (let i = 1; i <= 40; i++) books['b' + i] = { t: 'Книга ' + i, a: 'А', tr: i > 30 ? ['Сводные'] : i <= 12 ? ['Измена'] : ['Босс'] };
  const dates = ['2026-10-25', '2026-10-28', '2026-11-01', '2026-11-04', '2026-11-08'];
  dates.forEach((d, k) => {
    // каждый срез: «Измена» вытесняется, «Сводные» входят новыми книгами
    const ids = [...Array.from({ length: 12 - k * 2 }, (_, i) => 'b' + (i + 1)), ...Array.from({ length: 14 }, (_, i) => 'b' + (13 + i)), ...Array.from({ length: k * 2 }, (_, i) => 'b' + (31 + i))];
    days[d] = { x: ids.map((id, n) => ({ id, n: n + 1, l: 1000 + (id > 'b30' ? k * 300 : 0), v: 20000 })) };
  });
  const F = m.tropeForecast({ days, books });
  assert.ok(F.ready); assert.equal(F.span, 14);
  assert.ok(F.up.some((x) => x.name === 'Сводные'), JSON.stringify(F.items.map((x) => [x.name, x.verdict, x.score])));
  assert.ok(F.down.some((x) => x.name === 'Измена'));
  assert.equal(m.tropeForecast({ days: { '2026-11-01': days['2026-11-01'] }, books }).ready, false);
});
