import test from 'node:test';
import assert from 'node:assert/strict';
import { siteChecks } from '../writer/js/sitecheck.js';
import { siteInfo } from '../js/sitepub.js';

const site = siteInfo({ subOn: true, giftName: 'Проданная ночь', giftUrl: '', books: [
  { id: 's1', title: 'Альпийский *развод*', status: 'writing' },
  { id: 's2', title: 'Звериная тропа для двоих', status: 'writing', hidden: true },
] });

test('мой сайт: сверка книг Мастерской с сайтом — добавить, отметить завершённой, скрытая', () => {
  const wbooks = [
    { id: 'w1', title: 'Альпийский развод', status: 'done' },
    { id: 'w2', title: 'Звериная тропа для двоих', status: 'progress' },
    { id: 'w3', title: 'Развод для чёрной вдовы', status: 'progress' },
    { id: 'w4', title: 'Только идея', status: 'idea' },
  ];
  const k = siteChecks({ wbooks, site }).map((x) => x.k);
  assert.deepEqual(k, ['done:w1', 'hidden:w2', 'add:w3', 'gift']);
});

test('мой сайт: новые подписчики — только после последнего просмотра', () => {
  const subs = [{ at: '2026-10-01T10:00:00Z' }, { at: '2026-10-20T10:00:00Z' }];
  const s = siteChecks({ site: { ...site, giftUrl: 'https://x' }, subs, seenAt: '2026-10-10T00:00:00Z' });
  assert.equal(s.length, 1);
  assert.equal(s[0].subs, 1);
  assert.deepEqual(siteChecks({ site: null }), []);
});

test('домен сайта: напоминание за 2 месяца, дата правится', async () => {
  const { domainInfo, DOMAIN_TILL } = await import('../writer/js/sitecheck.js');
  const a = domainInfo({}, '2027-08-01');
  assert.equal(a.till, DOMAIN_TILL); assert.equal(a.due, '2027-08-28'); assert.equal(a.soon, false);
  assert.equal(domainInfo({}, '2027-08-28').soon, true);
  assert.equal(domainInfo({}, '2027-10-28').late, true);
  assert.equal(domainInfo({ site: { domainTill: '2028-10-27' } }, '2027-10-28').soon, false);
});

test('розыгрыш на сайте: дело на пятницу, пока не проведён', async () => {
  const { raffleTodo } = await import('../writer/js/sitecheck.js');
  assert.equal(raffleTodo(null, '2026-10-29'), null);
  assert.equal(raffleTodo({ raffleOn: false }, '2026-10-29'), null);
  assert.deepEqual(raffleTodo({ raffleOn: true }, '2026-10-29'), { date: '2026-10-30' });
  assert.equal(raffleTodo({ raffleOn: true, raffleLast: '2026-10-30' }, '2026-10-31'), null);
});

test('фрагмент для сайта — из глав рукописи до бесплатной на Литнете', async () => {
  const { fragText, fragChars, fitFree } = await import('../writer/js/sitefrag.js');
  const ch = (title, ps, chars) => ({ title, chars, paras: [{ kind: 'h', runs: [{ t: title }] }, ...ps.map((t) => ({ kind: 'p', runs: [{ t }] })), { kind: 'p', runs: [{ t: '' }] }] });
  const chs = [ch('Пролог', ['Раз.', 'Два.'], 100000), ch('Глава 1', ['Три.'], 90000), ch('Глава 2', ['Четыре.'], 50000)];
  assert.equal(fragText(chs, 1), 'Пролог\nРаз.\nДва.\nГлава 1\nТри.');
  assert.equal(fragChars(chs, 1), 190000);
  assert.equal(fitFree(chs), 1); // третья глава уже за 200 000 знаков
  const { fragBlocks } = await import('../site/content.js');
  assert.deepEqual(fragBlocks(fragText(chs, 0)), [{ h: 'Пролог' }, { p: 'Раз.' }, { p: 'Два.' }]);
});
