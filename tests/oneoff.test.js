import test from 'node:test';
import assert from 'node:assert/strict';
import { rescheduleBook, VDOVA } from '../writer/js/oneoff.js';

test('Черная вдова: пролог и глава 1 вышли 09.11, главы 2–7 — даты Литнета, дальше пн/ср/пт', () => {
  const tabs = ['Пролог', 'Глава 1', 'Глава 2', 'Глава 3', 'Глава 4', 'Глава 5', 'Глава 8', 'Глава 9', 'От автора']
    .map((title) => ({ title, chars: 1000 }));
  const pub = {
    'Пролог': { 'Литнет': { date: '2026-11-09', at: '2026-11-09' } },
    'Глава 1': { 'Литнет': { date: '2026-11-10', planned: true } },
    'Глава 2': { 'Литнет': { date: '2026-11-11', planned: true } },
    'Глава 3': { 'Литнет': { date: '2026-11-12', planned: true } },
    'Глава 8': { 'Литнет': { date: '2026-11-17', planned: true } },
    'Глава 9': { 'Литнет': { date: '2026-11-18', planned: true } },
  };
  const r = rescheduleBook({ title: 'Развод для черной вдовы', platforms: ['Литнет'], tabs, pub }, VDOVA, '2026-11-10');
  const d = (t) => r.pub[t]?.['Литнет']?.date;
  assert.equal(d('Пролог'), '2026-11-09');            // уже был — не трогаем
  assert.equal(d('Глава 1'), '2026-11-09');           // вышла 09.11
  assert.equal(r.pub['Глава 1']['Литнет'].planned, undefined);
  assert.equal(d('Глава 2'), '2026-11-11');
  assert.equal(d('Глава 3'), '2026-11-13');
  assert.equal(d('Глава 4'), '2026-11-16');
  assert.equal(d('Глава 7'), '2026-11-23');           // вкладки ещё нет — отметка по названию
  assert.equal(d('Глава 8'), '2026-11-25');           // ср
  assert.equal(d('Глава 9'), '2026-11-27');           // пт
  assert.deepEqual(r.pubDays, [1, 3, 5]);
  assert.ok(!r.changed.some((x) => x.ch === 'Пролог' || x.ch === 'Глава 2'));
});
