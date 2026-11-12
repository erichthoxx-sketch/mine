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
