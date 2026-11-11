import test from 'node:test';
import assert from 'node:assert/strict';
import { detectHook, hookBoard } from '../direct/js/hooks.js';

test('крючки: троп определяется по тексту объявления, ручная правка главнее, вывод — только при значимой разнице', () => {
  assert.equal(detectHook({ title: 'Развод для черной вдовы — новый роман', text: 'Марта хоронит мужа.' }), 'Развод');
  assert.equal(detectHook({ title: 'Он опасен. Она не боится', text: 'Самый опасный конкурент' }, ['Опасный герой']), 'Опасный герой');
  assert.equal(detectHook({ title: 'Читайте онлайн', text: 'Новая книга' }), '');
  const ads = [{ id: 1, cid: 7, state: 'ON', title: 'Развод и девичья фамилия', text: '' }, { id: 2, cid: 7, state: 'ON', title: 'Месть бывшему', text: '' }, { id: 3, cid: 7, state: 'OFF', title: 'Просто роман', text: '' }];
  const adDaily = [{ aid: 1, impr: 3000, clicks: 150 }, { aid: 2, impr: 3000, clicks: 60 }, { aid: 3, impr: 500, clicks: 5 }];
  const B = hookBoard({ ads, adDaily });
  assert.deepEqual(B.groups.map((g) => g.hook), ['Развод', 'Месть', '']);
  assert.match(B.verdict, /Лучше всего кликают на «Развод»: CTR 5,0 % против 2,0 % у «Месть»/);
  const M = hookBoard({ ads, adDaily, manual: { 2: 'Развод' } });
  assert.equal(M.rows.find((r) => r.aid === 2).hook, 'Развод'); assert.match(M.verdict, /нужны хотя бы два разных/);
});
