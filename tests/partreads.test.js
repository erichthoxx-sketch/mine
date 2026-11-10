import test from 'node:test';
import assert from 'node:assert/strict';
import { parsePartReads, mergePartReads, partRetention, dayOf } from '../writer/js/partreads.js';

const T = ['Части\tОценки читателей (количество оценок)\t11.11\t10.11\t09.11\t08.11',
  'Пролог\t4.61 (174)\t-\t103\t143\t169',
  'Глава 1\t4.72 (152)\t-\t31\t54\t63',
  'Глава 2\t4.49 (170)\t-\t29\t49\t48',
  'Глава 3\t4.62 (157)\t-\t35\t56\t56',
  'Глава 4\t4.8 (76)\t-\t16\t18\t26'].join('\n');

test('таблица «Статистика по частям» Литнета: дни, оценки, порядок частей', () => {
  const r = parsePartReads(T, '2026-11-11');
  assert.deepEqual(r.parts, ['Пролог', 'Глава 1', 'Глава 2', 'Глава 3', 'Глава 4']);
  assert.equal(r.days['2026-11-10']['Пролог'], 103);
  assert.equal(r.days['2026-11-11'], undefined); // «-» — нет данных
  assert.deepEqual(r.ratings['Глава 4'], { avg: 4.8, n: 76 });
  assert.equal(dayOf('31.12', '2026-01-05'), '2025-12-31'); // дата впереди — прошлый год
});

test('удержание от главы к главе и провал на платном пороге', () => {
  const r = mergePartReads({ days: { '2026-10-01': { 'Пролог': 5 } } }, parsePartReads(T, '2026-11-11'));
  assert.equal(r.days['2026-10-01']['Пролог'], 5); // старые дни сохраняются
  const ret = partRetention(r, '2026-11-08', '2026-11-10');
  assert.equal(ret[0].reads, 415); assert.equal(ret[0].retention, 100);
  assert.equal(ret[4].part, 'Глава 4'); assert.equal(ret[4].reads, 60);
  assert.equal(ret[4].retention, 14.5);
  assert.equal(ret[4].drop, 59.2); // от главы 3 (147) к главе 4 (60) ушли 59,2 %
});
