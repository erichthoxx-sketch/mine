// Проверяем состояние Яндекса до записи и после неё. Повторная попытка начинает с чтения.
import { todayISO } from '../../js/calc.js';
import { uid } from '../../js/ui.js';
import { call } from './api.js';
import { putLog, isDemo } from './demo.js';

export async function applyRecommendation(app, item, initial = app.ctx().settings) {
  if (isDemo() || initial.direct?.sandbox || !initial.directToken) throw Error('Изменения доступны в подключённом рабочем кабинете.');
  const user = app.store.user?.uid;
  const request = (...args) => {
    const current = app.ctx().settings;
    if (app.store.user?.uid !== user || current.directToken !== initial.directToken || current.direct?.sandbox ||
        current.direct?.proxy !== initial.direct?.proxy || current.direct?.clientLogin !== initial.direct?.clientLogin) {
      throw Error('Подключение изменилось. Откройте предложения заново.');
    }
    return call(initial, ...args, undefined, 'v501');
  };
  const getCampaign = async (field) => {
    const result = await request('campaigns', 'get', {
      SelectionCriteria: { Ids: [item.cid] }, FieldNames: ['Id', 'State', ...(field ? [field] : [])],
    }, 1);
    const camp = result.Campaigns?.find((c) => c.Id === item.cid);
    if (!camp || camp.State !== 'ON') throw Error('Кампания больше не запущена.');
    return camp;
  };
  const getAds = async (selection) => (await request('ads', 'get', {
    SelectionCriteria: selection, FieldNames: ['Id', 'AdGroupId', 'CampaignId', 'State', 'Status'],
  }, 1)).Ads || [];
  let verify, write, checked = false, unchanged = false, error = '';
  try {
    if (item.type === 'minus' || item.type === 'place') {
      const field = item.type === 'minus' ? 'NegativeKeywords' : 'ExcludedSites';
      const current = (await getCampaign(field))[field]?.Items || [];
      verify = async () => ((await getCampaign(field))[field]?.Items || []).includes(item.target);
      unchanged = current.includes(item.target);
      write = () => request('campaigns', 'update', {
        Campaigns: [{ Id: item.cid, [field]: { Items: [...current, item.target] } }],
      }, 0);
    } else if (item.type === 'pause') {
      await getCampaign();
      const read = async () => (await getAds({ Ids: [item.target] })).find((a) => a.Id === item.target && a.CampaignId === item.cid);
      const ad = await read();
      if (!ad) throw Error('Объявление не найдено в этой кампании.');
      unchanged = ad.State === 'SUSPENDED';
      if (!unchanged) {
        const mates = await getAds({ AdGroupIds: [ad.AdGroupId] });
        if (ad.State !== 'ON' || !mates.some((a) => a.Id !== ad.Id && a.CampaignId === item.cid &&
            a.AdGroupId === ad.AdGroupId && a.State === 'ON' && a.Status === 'ACCEPTED')) {
          throw Error('В группе нужен ещё один работающий вариант.');
        }
      }
      verify = async () => (await read())?.State === 'SUSPENDED';
      write = () => request('ads', 'suspend', { SelectionCriteria: { Ids: [item.target] } }, 0);
    } else throw Error('Неизвестное действие.');

    if (!unchanged) {
      try {
        const result = await write();
        error = (result.UpdateResults || result.SuspendResults || []).flatMap((x) =>
          (x.Errors || []).map((e) => e.Details || e.Message)).join('. ');
      } catch (e) { error = e.message; }
      try {
        checked = await verify();
      } catch (e) {
        error = [error, 'Проверка: ' + e.message].filter(Boolean).join('. ');
      }
      if (!checked && !error) error = 'Яндекс пока не подтвердил изменение. Сверьте состояние в кабинете.';
    }
  } catch (e) { error = e.message; }

  const result = { title: item.title, status: unchanged ? 'Уже действует в Яндексе' : checked ? 'Применено и проверено' : error };
  if (unchanged) return result;
  if (app.store.user?.uid === user) {
    try {
      await putLog(app, { id: 'l' + uid(), at: new Date().toISOString(), appliedDate: todayISO(), by: 'app',
        do: item.type === 'place' ? 'exclude' : item.type, cid: item.cid, text: item.title,
        why: item.reason, ok: checked, errors: checked ? [] : [error], warnings: [],
        recommendationKey: item.key, reviewGoal: item.goal, reviewMetric: item.metric, reviewDate: item.reviewDate });
    } catch {
      result.status += '. Запись в журнал не сохранилась.';
    }
  }
  return result;
}
