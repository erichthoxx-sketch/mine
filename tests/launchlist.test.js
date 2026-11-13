import test from 'node:test';
import assert from 'node:assert/strict';
import { launchChecklist } from '../writer/js/launchlist.js';

test('запуск книги: пункты отмечаются сами, следующий шаг — первый несделанный', () => {
  const book = { id: 'b1', title: 'Развод для черной вдовы', publishStart: '2026-11-09', direct: { link: 'https://litnet.com/ru/book/x', spoilers: [] }, svc: { annotation: 'Аннотация' }, legend: { idea: { logline: 'Крючок' } }, siteFragUpto: 'Глава 3' };
  const site = { books: [{ title: 'Развод *для черной вдовы*', frag: 'текст' }] };
  const L = launchChecklist({ book, site, settings: { litTag: { code: 'a', at: '2026-11-10', until: '2026-12-10' }, piracy: { at: '2026-11-12' } }, campaigns: [{ name: 'Директ: «Развод для черной вдовы»', start: '2026-11-10' }], contests: [], mailQueue: [], mailSent: [], piracy: [{ bookId: 'b1', status: 'new' }], today: '2026-11-12' });
  const by = Object.fromEntries(L.items.map((x) => [x.k, x.ok]));
  assert.deepEqual([by.plan, by.link, by.texts, by.site, by.frag, by.mail, by.tag, by.ads, by.pir], [true, true, true, true, true, false, true, true, false]);
  assert.equal(L.next.k, 'mail'); assert.equal(L.done, 7); assert.equal(L.total, 8);
  const empty = launchChecklist({ book: { id: 'b2', title: 'Новая' }, site: null, settings: {}, today: '2026-11-12' });
  assert.equal(empty.next.k, 'plan'); assert.equal(empty.items.find((x) => x.k === 'site').ok, null); // сайт ещё не загрузился — не считаем
});

test('календарь запуска: главы по дням, подписка, реклама, конкурсы, скидки', async () => {
  const { launchTimeline } = await import('../writer/js/launchlist.js');
  const b = { id: 'b', title: 'Развод для черной вдовы', subStart: '2026-11-25', pub: { 'Пролог': { 'Литнет': { date: '2026-11-09' } }, 'Глава 1': { 'Литнет': { date: '2026-11-09' } }, 'Глава 2': { 'Литнет': { date: '2026-11-16', planned: true } }, 'Глава 0': { 'Литнет': { date: '2026-01-01' } } } };
  const ev = launchTimeline({ book: b, today: '2026-11-13', campaigns: [{ name: 'Директ: «Развод для черной вдовы»', start: '2026-11-10', end: '2026-12-10' }], contests: [{ name: 'Дерзкие', end: '2026-11-30' }],
    days: [{ date: '2026-11-20', events: [{ type: 'discount', bookId: 'x', text: '-30 %' }, { type: 'discount', bookId: 'y' }] }], discountId: 'x' });
  assert.deepEqual(ev.map((e) => e.date + ' ' + e.kind), ['2026-11-09 chapter', '2026-11-10 ad', '2026-11-16 chapter', '2026-11-20 discount', '2026-11-25 sub', '2026-11-30 contest', '2026-12-10 ad']);
  assert.equal(ev[0].text, 'Пролог и Глава 1');
});
