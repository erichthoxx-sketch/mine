// Управляемое создание новой ЕПК (Yandex Direct JSON API v501).
// Каждый этап — отдельное подтвержденное действие пользователя. Модерация/запуск не вызываются.
import { call } from './api.js';

export const CREATOR_DEFAULT = {
  name: 'Черная вдова — мой первый тест',
  placement: 'search', // search | network
  strategy: 'clicks',  // clicks | conversions
  budget: 10000,      // ограничение на указанный период, без автопродления
  start: '',
  end: '',
  region: 225,        // Россия в справочнике геотаргетинга Яндекса
  groupName: 'Криминальная романтика',
  titles: 'На похоронах мужа я встретила его жену',
  texts: 'Он оказался жив. А человек из похоронного бюро знает обо мне слишком много.',
  keywords: 'остросюжетные любовные романы читать\nкриминальный любовный роман читать',
  campaignId: '',
  groupId: '',
  adId: '',
  keywordDone: false,
  suspended: false,
};
const micros = v => Math.round(Number(v) * 1000000);
const dateValid = v => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v + 'T00:00:00Z'));
export const creatorOf = (fl = {}) => ({ ...CREATOR_DEFAULT, ...(fl.creator || {}) });

export function validateCreator(c, { today, bookUrl = '', goalId = null } = {}) {
  const issues = [];
  if (!String(c.name || '').trim() || c.name.length > 255) issues.push('Название кампании должно быть от 1 до 255 символов.');
  if (!['search', 'network'].includes(c.placement)) issues.push('Выбери поиск или рекламную сеть.');
  if (!['clicks', 'conversions'].includes(c.strategy)) issues.push('Выбери стратегию.');
  if (!(Number(c.budget) > 0) || !Number.isFinite(Number(c.budget))) issues.push('Бюджет должен быть больше нуля.');
  if (!dateValid(c.start) || c.start < today) issues.push('Дата начала не может быть в прошлом.');
  if (!dateValid(c.end) || c.end < c.start) issues.push('Дата конца должна быть не раньше даты старта.');
  if (c.strategy === 'conversions' && !(Number(goalId) > 0)) issues.push('Для стратегии на конверсии требуется подтвержденная цель Метрики.');
  if (!Number.isInteger(Number(c.region)) || Number(c.region) < 0) issues.push('Выбери корректный регион.');
  if (!String(c.groupName || '').trim() || c.groupName.length > 255) issues.push('Название группы должно быть от 1 до 255 символов.');
  if (!/^https:\/\/(?:www\.)?litnet\.com\/(?:ru\/)?(?:book\/|.*\/book\/)/.test(String(bookUrl || ''))) {
    issues.push('Добавь https-ссылку на страницу книги в Литнете.');
  }
  return issues;
}
function activeStrategy(c, goalId) {
  const name = c.strategy === 'conversions' ? 'WB_MAXIMUM_CONVERSION_RATE' : 'WB_MAXIMUM_CLICKS';
  const params = { CustomPeriodBudget: {
    SpendLimit: micros(c.budget),
    StartDate: c.start,
    EndDate: c.end,
    AutoContinue: 'NO',
  } };
  if (name === 'WB_MAXIMUM_CONVERSION_RATE') params.GoalId = Number(goalId);
  return { BiddingStrategyType: name, [name === 'WB_MAXIMUM_CLICKS' ? 'WbMaximumClicks' : 'WbMaximumConversionRate']: params };
}
export function campaignPayload(c, { counterId = null, goalId = null } = {}) {
  const on = activeStrategy(c, goalId);
  const active = c.placement === 'search';
  const search = active
    ? { ...on, PlacementTypes: { SearchResults: 'YES', ProductGallery: 'NO' } }
    : { BiddingStrategyType: 'SERVING_OFF' };
  const network = active
    ? { BiddingStrategyType: 'SERVING_OFF' }
    : { ...on, PlacementTypes: { Network: 'YES' } };
  const obj = {
    Name: c.name.trim(),
    StartDate: c.start,
    UnifiedCampaign: {
      BiddingStrategy: { Search: search, Network: network },
      AttributionModel: 'AUTO',
      ...(counterId ? { CounterIds: { Items: [Number(counterId)] } } : {}),
    },
  };
  return { Campaigns: [obj] };
}
export function groupPayload(c, cid) {
  return { AdGroups: [{
    Name: c.groupName.trim(),
    CampaignId: Number(cid),
    RegionIds: [Number(c.region)],
    UnifiedAdGroup: { OfferRetargeting: 'NO' },
  }] };
}
const splitLines = (s, max) => [...new Set(String(s || '').split('\n').map(x => x.trim()).filter(Boolean))].slice(0, max);
export function adPayload(c, gid, bookUrl) {
  const titles = splitLines(c.titles, 7), texts = splitLines(c.texts, 3);
  if (!titles.length || !texts.length) throw new Error('Нужны минимум один заголовок и один текст.');
  if (titles.some(x=>x.length>56)) throw new Error('Каждый заголовок должен содержать не больше 56 символов.');
  if (texts.some(x=>x.length>81)) throw new Error('Каждый текст должен содержать не больше 81 символа.');
  return { Ads: [{ AdGroupId: Number(gid), ResponsiveAd: { Titles: titles, Texts: texts, Href: bookUrl } }] };
}
export function keywordsPayload(c, gid) {
  const phrases = splitLines(c.keywords, 15);
  if (!phrases.length) throw new Error('Впиши хотя бы одну ключевую фразу.');
  return { Keywords: phrases.map(Keyword => ({ Keyword, AdGroupId: Number(gid) })) };
}
export function addedId(result, what) {
  const first = result?.AddResults?.[0];
  if (first?.Errors?.length) throw new Error(what + ': ' + first.Errors.map(e => e.Message + (e.Details ? ': ' + e.Details : '')).join('; '));
  if (!(Number(first?.Id) > 0)) throw new Error(what + ': Яндекс не вернул номер созданного объекта. Проверь кабинет, прежде чем повторять.');
  return first.Id;
}
// Вызовы только после явного подтверждения интерфейса, без автоматических повторов записи.
export const createCampaign = (s, params) => call(s, 'campaigns', 'add', params, 0, undefined, 'v501');
export async function pauseCampaign(s, id) {
  const r = await call(s, 'campaigns', 'suspend', { SelectionCriteria: { Ids: [Number(id)] } }, 0, undefined, 'v501');
  const x = r.SuspendResults?.[0];
  if (!x || x.Errors?.length) throw new Error('Остановка не подтверждена: ' + (x?.Errors || []).map(e => e.Message).join('; '));
  return r;
}
export const createGroup = (s, params) => call(s, 'adgroups', 'add', params, 0, undefined, 'v501');
export const createAd = (s, params) => call(s, 'ads', 'add', params, 0, undefined, 'v501');
export const createKeywords = (s, params) => call(s, 'keywords', 'add', params, 0, undefined, 'v5');
