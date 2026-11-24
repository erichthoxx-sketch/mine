// Финансовая сводка по рекламируемым книгам. Отдельные колонки для расходов,
// роялти от всех источников и поведенческих когорт. Никакой ложной атрибуции покупок.
import { esc } from '../../../js/ui.js';
import { rub, num } from '../../../js/format.js';
import { outageSet } from '../../../js/calc.js';
import { campaignBookLinks } from '../pult.js';
import { campaignBookEconomics } from '../bookeconomics.js';
import { metrikaOf } from './metrika.js';

const rub0 = (n) => n == null ? '—' : rub(n, 0);
const pc = (n) => n == null ? 'мало данных' : (n * 100).toFixed(1).replace('.', ',') + ' %';
const rangeLine = (k, days) => {
  const x = k?.libToBuy?.[days];
  if (!x) return 'Нет детальной статистики';
  if (!x.eligible) return 'Ожидание: еще нет читательниц, наблюдавшихся ' + days + ' дней после добавления';
  return num(x.buyers) + ' из ' + num(x.eligible) + ' (' + pc(x.rate) + ')';
};
const entry = (r) => {
  const cohort = r.cohort, group = cohort?.landingBook || cohort?.campaign || null;
  const source = cohort?.landingBook ? 'те, кто впервые пришел на карточку этой книги из кампании' :
    cohort?.campaign ? 'все первые визиты из кампании (книгу входа не удалось подтвердить)' : null;
  const roy = r.royaltiesAllChannels30 == null ? 'нет надежной связи с названием книги в «Доходах»' :
    rub0(r.royaltiesAllChannels30) + ' роялти; ' + num(r.salesAllChannels30) + ' продаж';
  const req = r.breakevenBuys == null ? 'Нет среднего роялти с продажи этой книги' :
    'Для покрытия ' + rub0(r.spend30) + ' расходов потребовалось бы не меньше ' +
    num(r.breakevenBuys) + ' покупок по средней выплате ' + rub0(r.royaltyPerBookSale) + ' — если бы они пришли именно с этой рекламы';
  return '<div class="item" style="padding:12px 0">' +
    '<b>' + esc(r.bookTitle ? '«' + r.bookTitle + '»' : r.campaignName) + '</b>' +
    '<div class="small muted">Кампания №' + esc(String(r.campaignId)) +
    (r.association === 'mixed' ? ' · Внимание: несколько разных книг в одной кампании' :
      r.association === 'unknown' ? ' · Не удалось привязать к книге' : '') + '</div>' +
    '<div class="small"><b>Расход:</b> за 7 дней ' + rub0(r.spend7) + '; за 30 дней ' + rub0(r.spend30) + '</div>' +
    '<div class="small"><b>Добавления из Директа:</b> за 7 дней ' + (r.libraries7 == null ? 'нет надежных данных' :
      num(r.libraries7) + (r.costPerLibrary7 != null ? ' по ' + rub0(r.costPerLibrary7) : '')) +
    '; за 30 дней ' + (r.libraries30 == null ? 'нет надежных данных' :
      num(r.libraries30) + (r.costPerLibrary30 != null ? ' по ' + rub0(r.costPerLibrary30) : '')) + '</div>' +
    (r.royaltiesAllChannels7 != null ? '<div class="small"><b>Книга, все источники:</b> за 7 дней ' +
      rub0(r.royaltiesAllChannels7) + ' (' + num(r.salesAllChannels7) + ' продаж); за 30 дней ' + roy + '</div>' :
      '<div class="small"><b>Книга, все источники:</b> ' + esc(roy) + '</div>') +
    '<div class="small"><b>Порог безубыточности рекламы:</b> ' + esc(req) + '</div>' +
    '<div class="small"><b>Подтвержденные роялти от этой кампании:</b> не определены — Метрика не сообщает, какую книгу купили.</div>' +
    (group ? '<div class="small"><b>Когорта:</b> ' + esc(source) + ' · первый наблюдаемый визит: ' +
      esc(cohort.from) + '–' + esc(cohort.to) + '; добавили в библиотеку ' + num(group.lib) +
      ', первую покупку любой книги совершили ' + num(group.buy) + '. ' +
      '<div class="small">Покупка в течение 7 дней после добавления: ' + esc(rangeLine(group, 7)) + '</div>' +
      '<div class="small">В течение 14 дней: ' + esc(rangeLine(group, 14)) + '</div>' +
      '<div class="small">В течение 30 дней: ' + esc(rangeLine(group, 30)) + '</div></div>' :
      '<div class="small muted">Когорты пока не готовы: ' + esc(r.cohortError) + '</div>') +
    (!r.conversionAvailable ? '<div class="small warnc">Осторожно: ' + esc(r.conversionReason) + '</div>' : '') +
    '</div>';
};
export function bookEconomicsCard(a) {
  const c = a.ctx(), stats = a.snap('stats') || {}, main = a.snap('main') || {};
  const rows = campaignBookEconomics({
    campaigns: main.campaigns || [], ads: main.ads || [], books: c.data.w_books || [],
    sales: c.data.sales || [], daily: stats.daily || [], conv: stats.conv || [], stats,
    cohorts: a.snap('cohorts'), metrika: metrikaOf(c) || {}, today: c.today,
    outageDays: outageSet(c.data.days || []), links: campaignBookLinks(c), cohortError: c.settings.direct?.cohortsErr || ''
  }).filter((r) => r.spend30 > 0 || r.bookTitle);
  if (!rows.length) return '';
  return '<div class="card"><h2 style="margin:0 0 6px">Экономика книг и когорт</h2>' +
    '<p class="small muted">Автоматически связывает кампании с книгами, расходы за 7/30 дней, продажи книг из «Доходов» и когорты Метрики. Роялти указаны по ВСЕМ источникам, а покупки когорт — по ЛЮБОЙ книге автора. Это не ROMI: не выдаем общие продажи за доказанную рекламную выручку.</p>' +
    '<div class="list">' + rows.map(entry).join('') + '</div>' +
    '<p class="small muted">Для точной доходности каждой кампании нужна передача ID купленной книги и реальной суммы заказа вместе с источником. Метрика сейчас передает только общую цель «Покупка». Если покупок меньше 20, доля по когортам не оценивается.</p></div>';
}
