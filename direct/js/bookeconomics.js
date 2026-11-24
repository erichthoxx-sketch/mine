// Экономика рекламной кампании, привязанной к книге. Только проверяемые величины.
// Когортная цель "Покупка" в Метрике НЕ содержит ID купленной книги.
// Поэтому роялти книги из «Доходов» — по ВСЕМ источникам; это не рекламная атрибуция.
import { addDays } from '../../js/calc.js';
import { totals, convTotal } from './dcalc.js';
import { bookOfCampaign } from './pult.js';
import { litnetPage } from './mcalc.js';
import { conversionEvidence, missingConversionsDuringSpend } from './evidence.js';

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е')
  .replace(/\([^)]*\)/g, ' ').replace(/[^a-zа-я0-9]+/g, ' ').trim().replace(/\s+/g, ' ');
const money = (n) => Math.round(Number(n || 0) * 100) / 100;
const isMatch = (book, sale) => {
  const a = norm(book), b = norm(sale);
  if (!a || !b) return false;
  if (a === b) return true;
  return a.length >= 8 && b.length >= 8 && (b.startsWith(a + ' ') || a.startsWith(b + ' '));
};
export function matchingSaleName(title, sales = []) {
  const names = [...new Set(sales.filter((x) => isMatch(title, x.book)).map((x) => x.book))];
  return names.length === 1 ? names[0] : null;
}
const rollup = (list, from, to) => list.reduce((t, r) => {
  if (r.date < from || r.date > to) return t;
  t.qty += Number(r.qty) || 0; t.royalty += Number(r.royalty) || 0;
  return t;
}, { qty: 0, royalty: 0 });

export function campaignBookEconomics({
  campaigns = [], ads = [], books = [], sales = [], daily = [], conv = [], stats = {},
  cohorts = null, metrika = {}, today, outageDays = null, cohortError = '', now = Date.now()
} = {}) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(today || ''))) return [];
  const from7 = addDays(today, -6), from30 = addDays(today, -29), from90 = addDays(today, -89);
  const e = conversionEvidence(stats, today, { now });
  const libId = metrika.goals?.find((g) => /библиотек/i.test(g.name || ''))?.id;
  const results = [];
  for (const campaign of campaigns.filter((x) => x.state !== 'ARCHIVED')) {
    const campaignAds = ads.filter((x) => String(x.cid) === String(campaign.id));
    const landingIds = [...new Set(campaignAds.map((x) => litnetPage(x.href).bookId).filter(Boolean))];
    // Если внутри одной кампании рекламируют разные книги — никакой фиктивной привязки.
    const mixed = landingIds.length > 1;
    const book = mixed ? null : bookOfCampaign(campaign, campaignAds, books);
    const title = book?.title || null;
    const saleName = matchingSaleName(title, sales);
    const matchedSales = saleName ? sales.filter((x) => x.book === saleName) : [];
    const bookFound = !!saleName;
    const sale7 = bookFound ? rollup(matchedSales, from7, today) : null;
    const sale30 = bookFound ? rollup(matchedSales, from30, today) : null;
    const sale90 = bookFound ? rollup(matchedSales, from90, today) : null;
    const perSale = sale90?.qty > 0 ? sale90.royalty / sale90.qty : null;
    const spend7 = totals(daily, from7, today, campaign.id).cost;
    const spend30 = totals(daily, from30, today, campaign.id).cost;
    const convAvailable = e.ready && (!stats.goalIds || stats.goalIds.includes(String(libId))) && !missingConversionsDuringSpend(daily, from30, today, outageDays, campaign.id);
    const libraries7 = convAvailable && libId ? convTotal(conv, from7, today, campaign.id, [String(libId)], outageDays) : null;
    const libraries30 = convAvailable && libId ? convTotal(conv, from30, today, campaign.id, [String(libId)], outageDays) : null;
    const landingId = !mixed && landingIds.length === 1 ? landingIds[0] : null;
    const group = cohorts?.camps?.[String(campaign.id)] || null;
    const bookGroup = landingId ? cohorts?.campBooks?.[String(campaign.id)]?.[landingId] || null : null;
    const cohortsReady = !!cohorts?.at && cohorts.to >= addDays(today, -3) && cohorts.to < today && !cohortError && !!group;
    // Период формирования когорты — до вчерашнего дня; не делим ее на расход за 7/30 дней.
    const cohort = cohortsReady ? {
      at: cohorts.at, from: cohorts.from, to: cohorts.to,
      campaign: group, landingBook: bookGroup,
      bookLandingId: landingId, landingVerified: !!bookGroup && !!landingId,
      note: 'Покупки когорты — любой книги автора, не подтвержденные продажи этой книги.'
    } : null;
    const requiredBuys = perSale > 0 && spend30 > 0 ? Math.ceil(spend30 / perSale) : null;
    results.push({
      campaignId: campaign.id, campaignName: campaign.name, bookTitle: title, landingId,
      association: mixed ? 'mixed' : bookFound ? 'book' : title ? 'missingSales' : 'unknown',
      from7, from30, today, spend7: money(spend7), spend30: money(spend30),
      libraries7, libraries30, costPerLibrary7: libraries7 > 0 ? money(spend7 / libraries7) : null,
      costPerLibrary30: libraries30 > 0 ? money(spend30 / libraries30) : null,
      conversionAvailable: convAvailable, conversionReason: convAvailable ? '' : e.reason || 'Есть расход во время сбоя учета целей',
      royaltiesAllChannels7: sale7 && money(sale7.royalty), royaltiesAllChannels30: sale30 && money(sale30.royalty),
      salesAllChannels7: sale7?.qty ?? null, salesAllChannels30: sale30?.qty ?? null,
      royaltyPerBookSale: perSale != null ? money(perSale) : null,
      breakevenBuys: requiredBuys,
      cohort, cohortError: cohortError || (!cohortsReady ? 'Нет свежей подтвержденной когорты этой кампании.' : ''),
      // В отсутствие транзакции с ID книги и источником не вычисляем рекламную выручку и ROI.
      attributedBookRoyalty: null, attributedBookROI: null,
      note: 'Роялти книги — все источники. События покупки Директа не содержат ID произведения. ROI этой книги нельзя подтвердить.'
    });
  }
  return results;
}
