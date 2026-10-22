import { test } from 'node:test';
import assert from 'node:assert/strict';
import { apiBase } from '../direct/js/api.js';
import { CREATOR_DEFAULT, validateCreator, campaignPayload, groupPayload, adPayload, keywordsPayload,
  addedId, pauseCampaign } from '../direct/js/creator.js';

const draft = { ...CREATOR_DEFAULT, name: 'Черная вдова — мой тест', budget: 10000, start: '2026-11-18', end: '2026-12-01' };
const url = 'https://litnet.com/ru/book/razvod-dlya-chernoy-vdovy';

test('Новая ЕПК: подготовка с лимитом на период и без автопродления', () => {
  assert.deepEqual(validateCreator(draft, { today: '2026-10-22', bookUrl: url }), []);
  const body = campaignPayload(draft, { counterId: 123, goalId: null }).Campaigns[0];
  assert.equal(body.Name, draft.name);
  assert.equal(body.StartDate, draft.start);
  assert.equal(body.UnifiedCampaign.AttributionModel, 'AUTO');
  assert.equal(body.UnifiedCampaign.BiddingStrategy.Search.BiddingStrategyType, 'WB_MAXIMUM_CLICKS');
  assert.equal(body.UnifiedCampaign.BiddingStrategy.Network.BiddingStrategyType, 'SERVING_OFF');
  const period = body.UnifiedCampaign.BiddingStrategy.Search.WbMaximumClicks.CustomPeriodBudget;
  assert.deepEqual(period, { SpendLimit: 10_000_000_000, StartDate: '2026-11-18', EndDate: '2026-12-01', AutoContinue: 'NO' });
  assert.deepEqual(body.UnifiedCampaign.CounterIds.Items, [123]);
});

test('Конверсионный режим требует цель, не создает ее из воздуха', () => {
  const cfg = { ...draft, placement: 'network', strategy: 'conversions' };
  assert.match(validateCreator(cfg, { today: '2026-10-22', bookUrl: url }).join(' '), /цель Метрики/);
  const obj = campaignPayload(cfg, { counterId: 123, goalId: 991 }).Campaigns[0].UnifiedCampaign.BiddingStrategy;
  assert.equal(obj.Search.BiddingStrategyType, 'SERVING_OFF');
  assert.equal(obj.Network.BiddingStrategyType, 'WB_MAXIMUM_CONVERSION_RATE');
  assert.equal(obj.Network.WbMaximumConversionRate.GoalId, 991);
  assert.equal(obj.Network.WbMaximumConversionRate.CustomPeriodBudget.AutoContinue, 'NO');
});

test('Мастер требует существующую страницу книги и будущий рекламный период', () => {
  assert.match(validateCreator(draft, { today: '2026-11-20', bookUrl: url }).join(' '), /прошлом/);
  assert.match(validateCreator(draft, { today: '2026-10-22', bookUrl: '' }).join(' '), /ссылку/);
  assert.match(validateCreator({ ...draft, end: '2026-11-01' }, { today: '2026-10-22', bookUrl: url }).join(' '), /конца/);
});

test('ЕПК: группа, объявление и ключевые фразы составлены без запуска модерации', () => {
  const g = groupPayload(draft, 100).AdGroups[0];
  assert.equal(g.CampaignId, 100);
  assert.equal(g.RegionIds[0], 225);
  assert.deepEqual(g.UnifiedAdGroup, { OfferRetargeting: 'NO' });
  const a = adPayload(draft, 101, url).Ads[0];
  assert.equal(a.AdGroupId, 101);
  assert.equal(a.ResponsiveAd.Href, url);
  assert.equal(a.ResponsiveAd.Titles.length, 1);
  const k = keywordsPayload(draft, 101).Keywords;
  assert.equal(k.length, 2);
  assert.equal(k[0].AdGroupId, 101);
  assert.throws(() => adPayload({ ...draft, titles: 'X'.repeat(57) }, 101, url), /56/);
});

test('Ошибки записи в Директ не маскируются успешным созданием', () => {
  assert.equal(addedId({ AddResults: [{ Id: 123 }] }, 'Кампания'), 123);
  assert.throws(() => addedId({ AddResults: [{ Errors: [{ Message: 'Неверный бюджет' }] }] }, 'Кампания'), /Неверный бюджет/);
  assert.throws(() => addedId({}, 'Кампания'), /не вернул/);
});

test('v501 не смешивается со старым API v5', () => {
  const settings = { directToken: 'test', direct: { proxy: 'https://example.workers.dev' } };
  assert.equal(apiBase(settings), 'https://example.workers.dev/live/json/v5/');
  assert.equal(apiBase(settings, 'v501'), 'https://example.workers.dev/live/json/v501/');
  assert.throws(() => apiBase(settings, 'v6'), /версия/);
});

test('Остановка требует успешного ответа Яндекса, не просто HTTP 200', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(JSON.stringify({result:{SuspendResults:[{Errors:[{Message:'Не удалось остановить'}]}]}}), {status:200,headers:{'Content-Type':'application/json'}}));
  await assert.rejects(pauseCampaign({directToken:'test',direct:{proxy:'https://example.workers.dev'}},123), /Не удалось остановить/);
});
