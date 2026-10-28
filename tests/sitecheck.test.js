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
