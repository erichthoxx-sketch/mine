import test from 'node:test';
import assert from 'node:assert/strict';
import { newBookDue, draftFor } from '../writer/js/newbookmail.js';

test('письмо о новом романе: только книга, у которой первая глава через 0–5 дней', () => {
  const wb = [
    { id: 'a', title: 'Новая', status: 'progress', pub: { 'Пролог': { 'Литнет': { date: '2026-11-16', planned: true } } } },
    { id: 'b', title: 'Идёт', status: 'progress', pub: { 'Глава 1': { 'Литнет': { date: '2026-11-01' } }, 'Глава 2': { 'Литнет': { date: '2026-11-15' } } } },
    { id: 'c', title: 'Далеко', status: 'progress', publishStart: '2026-12-20' },
    { id: 'd', title: 'По плану', status: 'progress', publishStart: '2026-11-18' },
  ];
  assert.deepEqual(newBookDue(wb, '2026-11-13').map((x) => x.id), ['a', 'd']);
  const d = draftFor({ id: 'a', title: 'Новая' }, { id: 's1', tagline: 'Крючок', ann: 'Абзац один\nАбзац два' });
  assert.equal(d.book, 's1'); assert.equal(d.text, 'Крючок\n\nАбзац один\n\nАбзац два'); assert.equal(d.subject, 'Новый роман: «Новая»');
});
