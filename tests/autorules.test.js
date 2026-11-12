import test from 'node:test';
import assert from 'node:assert/strict';
import { autoPlan, AUTO_MAX } from '../direct/js/autorules.js';

const main = { campaigns: [{ id: 7, name: 'ЕПК', state: 'ON', negatives: ['фильм'] }, { id: 8, name: 'Стоит', state: 'OFF', negatives: [] }], groups: [{ cid: 7, negatives: ['аудиокнига'] }], ads: [], keywords: [] };
const stats = {
  queries: [{ query: 'развод роман скачать fb2', cid: 7, impr: 40, clicks: 4, cost: 3 }, { query: 'роман слушать аудиокнига', cid: 7, impr: 30, clicks: 5, cost: 2 }, { query: 'роман скачать', cid: 8, impr: 30, clicks: 5, cost: 2 }, { query: 'любовный роман фильм', cid: 7, impr: 9, clicks: 3, cost: 1 }],
  placements: [{ CampaignId: 7, Placement: 'game.app.com', AdNetworkType: 'AD_NETWORK', Impressions: 900, Clicks: 40, Cost: 5, BounceRate: 80 }, { CampaignId: 7, Placement: 'dzen.ru', AdNetworkType: 'AD_NETWORK', Impressions: 900, Clicks: 60, Cost: 9, BounceRate: 12 }],
};
const goal = { do: 'goal', campaign: 7, goal: 548467220, goalName: 'Покупка книги', why: 'началась подписка' };

test('автоправила: только включённые, только идущие кампании, без повторов', () => {
  assert.deepEqual(autoPlan({ main, stats, on: {}, today: '2026-11-12', goalActs: [goal] }), []);
  const all = autoPlan({ main, stats, on: { minus: true, places: true, fatigue: true, goal: true }, today: '2026-11-12', goalActs: [goal] });
  assert.equal(all[0].rule, 'goal');
  const minus = all.filter((x) => x.rule === 'minus');
  assert.ok(minus.length >= 1 && minus.every((x) => x.act.campaign === 7 && x.act.do === 'minus')); // остановленная кампания не трогается
  assert.ok(!minus.some((x) => ['фильм', 'аудиокнига'].includes(x.act.phrases[0]))); // уже в минус-словах кампании или группы
  const pl = all.find((x) => x.rule === 'places');
  assert.deepEqual(pl.places, ['game.app.com']); assert.equal(pl.cid, 7);
  // уже сделанное не повторяется
  const again = autoPlan({ main, stats, on: { minus: true, places: true, goal: true }, today: '2026-11-12', goalActs: [goal], done: [...all.map((x) => x.key), ...all.flatMap((x) => x.keys || [])] });
  assert.deepEqual(again, []);
  assert.ok(all.length <= AUTO_MAX);
});

test('очередь предложений: только выключенные правила, без «Не надо», со стартовыми минус-словами', async () => {
  const { approvalQueue } = await import('../direct/js/autorules.js');
  const main = { campaigns: [{ id: 1, name: 'ЕПК', state: 'ON', negatives: [] }], groups: [], ads: [], keywords: [] };
  const stats = { queries: [{ cid: 1, query: 'черная вдова скачать fb2', clicks: 3, cost: 30, impr: 50 }, { cid: 1, query: 'скачать роман бесплатно', clicks: 2, cost: 20, impr: 40 }] };
  const starter = [{ do: 'minus', campaign: 1, phrases: ['скачать', 'fb2', 'торрент', 'аудиокнига', 'фильм'] }];
  const q = approvalQueue({ main, stats, on: {}, today: '2026-11-12', starter });
  assert.equal(q[0].key, 'starter:1'); assert.equal(q[0].camp, 'ЕПК');
  assert.ok(q.some((x) => x.rule === 'minus'));
  // правило включено галочкой — его действия делаются сами и в очередь не идут
  assert.ok(!approvalQueue({ main, stats, on: { minus: true }, today: '2026-11-12' }).some((x) => x.rule === 'minus'));
  // «Не надо» — больше не предлагаем
  const no = q.map((x) => x.key);
  assert.equal(approvalQueue({ main, stats, on: {}, today: '2026-11-12', starter, no }).length, 0);
});

test('очередь: аудитория «добавили, но не купили», подключение к группам, новое объявление без спойлеров', async () => {
  const { retargetItems, retargetRules, newAdItems, approvalQueue } = await import('../direct/js/autorules.js');
  const { spoilerHits, spoilerList } = await import('../js/spoilers.js');
  const main = { campaigns: [{ id: 1, name: 'ЕПК', state: 'ON', strategy: { network: 'WB_MAXIMUM_CONVERSION_RATE' } }], groups: [{ id: 10, cid: 1, name: 'Группа' }],
    ads: [{ id: 100, gid: 10, cid: 1, state: 'ON', title: 'Развод для черной вдовы', href: 'https://litnet.com/ru/book/x-b1?utm_litref=a' }] };
  assert.deepEqual(retargetItems({ main, goals: { lib: null, buy: ['2'] } }), []);
  // кампания учится на добавлениях в библиотеку — ретаргетинг не предлагаем вовсе
  const libCamp = { ...main, campaigns: [{ ...main.campaigns[0], goal: 1 }] };
  assert.deepEqual(retargetItems({ main: libCamp, goals: { lib: '1', buy: ['2', '3'] }, saved: {} }), []);
  // подключили раньше времени — предлагаем убрать
  const undo = retargetItems({ main: libCamp, goals: { lib: '1', buy: ['2'] }, saved: { listId: 77, groups: [10] } });
  assert.deepEqual(undo.map((x) => [x.rule, x.gid, x.listId]), [['unretarget', 10, 77]]);
  // цель кампании — покупка: сначала аудитория, потом подключение
  const buyCamp = { ...main, campaigns: [{ ...main.campaigns[0], goal: 2 }] };
  const first = retargetItems({ main: buyCamp, goals: { lib: '1', buy: ['2', '3'] }, saved: {} });
  assert.equal(first.length, 1); assert.equal(first[0].rule, 'audience');
  assert.deepEqual(retargetRules('1', ['2', '3']), [{ Operator: 'ALL', Arguments: [{ ExternalId: 1, MembershipLifeSpan: 90 }] }, { Operator: 'NONE', Arguments: [{ ExternalId: 2, MembershipLifeSpan: 540 }, { ExternalId: 3, MembershipLifeSpan: 540 }] }]);
  const next = retargetItems({ main: buyCamp, goals: { lib: '1', buy: ['2'] }, saved: { listId: 77 } });
  assert.deepEqual(next.map((x) => [x.rule, x.gid, x.listId]), [['retarget', 10, 77]]);
  assert.equal(retargetItems({ main: buyCamp, goals: { lib: '1', buy: ['2'] }, saved: { listId: 77, groups: [10] } }).length, 0);
  const wb = { direct: { spoilers: 'муж жив', ads: [{ h1: 'Развод для черной вдовы', text: 'Уже было' }, { h1: 'Она похоронила мужа', h2: 'Живого', text: 'Спойлер' }, { h1: 'Вдова с характером', h2: 'Новый роман', text: 'Криминал, юмор и очень опасный мужчина. Читать на Литнете' }, { h1: 'x'.repeat(57), text: 'длинный заголовок' }] } };
  const ads = newAdItems({ main, bookOf: () => wb, hits: (t, b) => spoilerHits(t, spoilerList(b)) });
  assert.equal(ads.length, 1);
  assert.deepEqual(ads[0].ad, { Title: 'Вдова с характером', Title2: 'Новый роман', Text: 'Криминал, юмор и очень опасный мужчина. Читать на Литнете', Href: 'https://litnet.com/ru/book/x-b1?utm_litref=a', Mobile: 'NO' });
  const q = approvalQueue({ main, stats: {}, on: {}, today: '2026-11-12', extra: [...first, ...ads] });
  assert.deepEqual(q.map((x) => x.rule), ['audience', 'newad']); assert.ok(q[0].why && q[1].why.includes('модерацию'));
  assert.equal(approvalQueue({ main, stats: {}, on: {}, today: '2026-11-12', extra: ads, done: [ads[0].key] }).length, 0);
});

test('очередь: запрос, который уже привёл читательниц, — добавить фразой', async () => {
  const { winnerQueryItems } = await import('../direct/js/autorules.js');
  const { queryConvRows } = await import('../direct/js/dcalc.js');
  assert.deepEqual(queryConvRows([{ Query: 'Роман Про Мафию', CampaignId: 1, Conversions_5_LSCCD: 3 }, { Query: 'x', CampaignId: 1, Conversions_5_LSCCD: 0 }]), { '1|роман про мафию': { 5: 3 } });
  const main = { campaigns: [{ id: 1, state: 'ON' }], keywords: [{ cid: 1, gid: 10, phrase: '"любовный роман" -скачать', state: 'ON' }] };
  const stats = { queries: [
    { cid: 1, gid: 10, query: 'роман про мафию читать', conv: { 5: 3 } }, { cid: 1, gid: 10, query: 'любовный роман', conv: { 5: 9 } },
    { cid: 1, gid: 10, query: 'роман', conv: { 5: 4 } }, { cid: 1, gid: 10, query: 'криминальный роман онлайн', conv: { 5: 1 } }, { cid: 1, gid: 10, query: 'чужая цель тут', conv: { 9: 7 } }] };
  const r = winnerQueryItems({ main, stats, goals: { lib: '5', buy: ['6'] } });
  assert.deepEqual(r.map((x) => x.act.phrases[0]), ['роман про мафию читать']);
  assert.deepEqual(r[0].act, { do: 'keywords', group: 10, phrases: ['роман про мафию читать'], why: 'запрос привёл 3 читательниц за 30 дней' });
  assert.equal(winnerQueryItems({ main, stats, goals: {} }).length, 0);
});

test('очередь: в кампании нет действующей метки Литнета — поставить', async () => {
  const { litTagItems } = await import('../direct/js/autorules.js');
  const main = { campaigns: [{ id: 1, state: 'ON', track: 'utm_source=yandex&utm_litref=old1' }, { id: 2, state: 'ON', track: '' }, { id: 3, state: 'ON', track: 'utm_litref=new9' }, { id: 4, state: 'ON', track: '' }, { id: 5, state: 'ON' }],
    ads: [{ cid: 1, href: 'https://litnet.com/ru/book/a-b1' }, { cid: 2, href: 'https://litnet.com/ru/book/a-b1' }, { cid: 3, href: 'https://litnet.com/ru/book/a-b1' }, { cid: 4, href: 'https://lanafreitag.ru/' }, { cid: 5, href: 'https://litnet.com/ru/book/a-b1' }] };
  const r = litTagItems({ main, code: 'new9' });
  assert.deepEqual(r.map((x) => [x.cid, x.act.tag]), [[1, 'utm_litref=new9'], [2, 'utm_litref=new9']]);
  assert.equal(litTagItems({ main, code: '' }).length, 0); assert.equal(litTagItems({ main, code: 'new9', late: true }).length, 0);
});
