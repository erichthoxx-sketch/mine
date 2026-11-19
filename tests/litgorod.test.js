import { test } from 'node:test';
import assert from 'node:assert/strict';
import { litgorodPlan, salesPhase, dupEffect, dupSummary } from '../js/litgorod.js';
import { htmlToMd, parseLitnetList, rivalBoard } from '../js/market.js';

const day = (i) => new Date(Date.UTC(2026, 10, 19) - i * 864e5).toISOString().slice(0, 10);
const T = day(0);
// книга: 60 дней назад пик, сейчас почти ничего; вторая — на пике
const sales = [];
for (let i = 80; i >= 0; i--) {
  sales.push({ date: day(i), book: 'Старая книга', royalty: i > 50 ? 1000 : 50, qty: 1 });
  if (i < 20) sales.push({ date: day(i), book: 'Новая книга. Часть 1', royalty: 500, qty: 1 });
}

test('Литгород: после пика — пора, на пике — подождать, пишется — после завершения, эксклюзив — нельзя', () => {
  const wbooks = [{ id: 'a', title: 'Старая книга', status: 'done' }, { id: 'b', title: 'Новая книга', status: 'done' }, { id: 'c', title: 'Пишу', status: 'progress' }, { id: 'd', title: 'Эксклюзивная', status: 'done' }, { id: 'e', title: 'Идея', status: 'idea' }];
  const P = litgorodPlan({ wbooks, sales, today: T, excl: ['Эксклюзивная'], priceOf: (t) => (t === 'Старая книга' ? 99 : 0) });
  const k = Object.fromEntries(P.map((x) => [x.id, x.k]));
  assert.deepEqual(k, { a: 'go', b: 'wait', c: 'later', d: 'no' });
  assert.equal(P[0].id, 'a'); assert.equal(P[0].minPrice, 95);
  assert.ok(salesPhase(sales.filter((s) => s.book === 'Старая книга'), T).ratio < 0.1);
});

test('Литгород: после выкладки считаем Литнет до и после и продажи Литгорода; сводка по выложенным', () => {
  const rows = [];
  for (let i = 40; i >= 0; i--) { rows.push({ date: day(i), book: 'X', royalty: 100 }); if (i < 20) rows.push({ date: day(i), book: 'X', royalty: 70, platform: 'Литгород' }); }
  const e = dupEffect(rows, day(19), T);
  assert.equal(e.ready, true); assert.ok(Math.abs(e.change) < 1e-9); assert.ok(Math.abs(e.lgWeek - 490) < 1);
  assert.equal(dupEffect(rows, day(5), T).ready, false);
  const P = litgorodPlan({ wbooks: [{ id: 'x', title: 'X', status: 'done' }], sales: rows, today: T, dup: { x: day(19) } });
  assert.equal(P[0].k, 'done'); assert.equal(dupSummary(P).n, 1);
});

test('страница топа через переходник: HTML → тот же текст, что у читалки → карточки', () => {
  const h = `<html><head><script>var x='<h4>';</script></head><body><div><a href="/ru/book/plohoi-b621533"><img alt="hashtag" src="/h.svg"> 1 <img alt="star" src="/s.svg"> Эксклюзив</a>
    <h4><a href="https://litnet.com/ru/book/plohoi-b621533">Плохой &laquo;сводный&raquo;</a></h4><h5><a href="/ru/a-u1">Екатерина Юдина</a></h5>
    <a href="/ru/book/plohoi-b621533"><span><img alt="inProgress" src="/i.svg"> 11 Ноя</span> 153 стр <img alt="eye" src="/e.svg"> 3.1М <img alt="addedToLibrary" src="/l.svg"> 25.4К</a>
    <p>- Маш, тот парень с моим сводным</p><div><a href="/ru/book/plohoi-b621533">159 ₽</a></div></div></body></html>`;
  const [b] = parseLitnetList('\n' + htmlToMd(h));
  assert.deepEqual([b.id, b.title, b.author, b.rank, b.excl, b.status, b.pages, b.views, b.lib, b.price], ['621533', 'Плохой «сводный»', 'Екатерина Юдина', 1, true, 'progress', 153, 3100000, 25400, 159]);
  assert.ok(b.tropes.includes('Сводные'));
});

test('конкуренты: похожие по тропам и с несколькими книгами, без неё самой; прирост библиотек в день', () => {
  const snap = { books: { 1: { t: 'А', a: 'Ирина', tr: ['Развод'] }, 2: { t: 'Б', a: 'Ирина', tr: [] }, 3: { t: 'В', a: 'Ольга', tr: ['Драконы'] }, 4: { t: 'Г', a: 'Лана Фрейтаг', tr: ['Развод'] }, 5: { t: 'Д', a: 'Мария', tr: ['Драконы'] }, 6: { t: 'Е', a: 'Мария', tr: [] } },
    days: { [day(7)]: { u: [{ id: '1', n: 3, l: 1000 }, { id: '3', n: 1, l: 5000 }] }, [day(0)]: { u: [{ id: '1', n: 2, l: 1700 }, { id: '2', n: 5, l: 300 }, { id: '3', n: 1, l: 5100 }, { id: '4', n: 4, l: 900 }, { id: '5', n: 6, l: 50 }, { id: '6', n: 7, l: 40 }] } } };
  const R = rivalBoard(snap, { myTropes: ['развод'], me: 'Лана Фрейтаг' });
  assert.deepEqual(R.rivals.map((r) => r.name), ['Ирина', 'Мария']);
  assert.equal(R.rivals[0].perDay, 100); assert.deepEqual(R.rivals[0].common, ['Развод']);
  assert.ok(!R.rivals.some((r) => r.name === 'Ольга'));
});
