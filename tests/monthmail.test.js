import test from 'node:test';
import assert from 'node:assert/strict';
import { prevMonth, monthSummary, monthLetter } from '../writer/js/monthcalc.js';

test('итог месяца: написано, главы, роялти, реклама, пираты — и письмо', () => {
  assert.equal(prevMonth('2026-11-12'), '2026-10'); assert.equal(prevMonth('2027-01-03'), '2026-12');
  const data = {
    sales: [{ date: '2026-10-05', royalty: 30000 }, { date: '2026-10-20', royalty: 20000 }, { date: '2026-09-11', royalty: 40000 }, { date: '2026-11-01', royalty: 999 }],
    w_books: [{ history: { '2026-09-28': 100000, '2026-10-15': 160000, '2026-10-30': 220000, '2026-11-02': 230000 }, pub: { 'Глава 1': { litnet: { date: '2026-10-03' }, litgorod: { date: '2026-10-09' } }, 'Глава 2': { litnet: { date: '2026-10-10' } }, 'Глава 3': { litnet: { date: '2026-11-01' } }, 'Глава 4': { litnet: { date: '2026-10-20', planned: true } } } }],
    reports: [{ start: '2026-10-06', spend: 5000 }, { start: '2026-09-29', spend: 700 }],
    w_piracy: [{ foundAt: '2026-10-12T10:00:00Z', status: 'gone', goneAt: '2026-10-20T10:00:00Z' }, { foundAt: '2026-10-13T10:00:00Z', status: 'skip' }],
  };
  const s = monthSummary(data, '2026-10');
  assert.deepEqual([s.income, s.incomePrev, s.chars, s.chapters, s.spend, s.found, s.gone], [50000, 40000, 120000, 2, 5000, 1, 1]);
  const L = monthLetter(s);
  assert.equal(L.subject, 'Итог месяца: октябрь 2026');
  assert.match(L.text, /Написано: 120 000 знаков \(3,0 а\.л\.\)/); assert.match(L.text, /Роялти: 50 000 ₽ \(\+25 % к прошлому месяцу\)/); assert.match(L.text, /Реклама: 5 000 ₽ — 10 % от роялти/); assert.match(L.text, /найдено копий 1, удалено 1/);
});
