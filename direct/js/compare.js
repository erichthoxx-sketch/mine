// «Все кампании — кто работает лучше» (19.11.2026, её «да»: сравнение кампаний и таргетологов в одной таблице с оценками).
// Одно мерило для всех — сколько возвращает 1 ₽ рекламы:
// • свой Директ — ожидаемое от добавлений в библиотеку (ценность добавления ÷ его цена, «Диагноз»), плюс оценка 0–100;
// • кампании «Доходов» (таргетологи, «Литнет платит», свой таргет) — прирост дохода против дней без рекламы (campaignVerdict).
// Методы разные, поэтому вывод — грубое сравнение «кто отдаёт рубль лучше», а не точная бухгалтерия. Чистые функции; тест — tests/diagnose.test.js.
import { partnerOf, CHANNEL_NAMES } from '../../js/adroi.js';

export const kindOf = (share) => (share == null ? 'wait' : share >= 1.2 ? 'good' : share >= 0.9 ? 'even' : 'bad');
export const KIND_TEXT = { good: 'окупается', even: 'примерно в ноль', bad: 'не окупается', wait: 'ждём данных' };

// direct — [{ id, name, book, cost, score, grade, share, lib, cpa, enough, live }]; income — строки adBoard; partners — w_links kind target
export function compareRows({ direct = [], income = [], partners = [] } = {}) {
  const rows = [
    ...direct.filter((x) => x.cost > 0).map((x) => ({
      src: 'direct', id: x.id, name: x.book ? `«${x.book}»` : x.name, sub: x.book ? x.name : '', who: 'Мой Директ', cost: Math.round(x.cost),
      share: x.enough ? x.share : null, score: x.score, grade: x.grade, live: x.live !== false, est: true,
      note: !x.enough ? 'мало данных для оценки' : x.share == null ? `добавление ${Math.round(x.cpa || 0)} ₽ — ценность станет видна по продажам` : '',
    })),
    ...income.filter((r) => r.c.src !== 'direct' && r.m.status !== 'planned').map((r) => {
      const p = partnerOf(r.c, partners);
      return { src: 'income', id: r.c.id, name: r.c.name || 'Кампания', sub: r.book?.title && !String(r.c.name || '').toLowerCase().includes(r.book.title.toLowerCase()) ? `«${r.book.title}»` : '',
        who: p?.name || CHANNEL_NAMES[r.c.channel] || CHANNEL_NAMES.other, cost: Math.round(r.m.spendTotal || 0), share: r.v.share ?? null, score: null, live: r.live, est: !!r.v.est,
        note: r.v.kind === 'wait' ? r.v.text : r.reportDue ? 'нет отчёта о расходе за неделю' : '' };
    }),
  ].map((x) => ({ ...x, kind: kindOf(x.share) }));
  rows.sort((a, b) => (a.share == null) - (b.share == null) || (b.share ?? 0) - (a.share ?? 0) || b.cost - a.cost);
  const known = rows.filter((x) => x.share != null);
  const f2 = (v) => v.toFixed(2).replace('.', ',');
  let verdict = '';
  if (known.length >= 2 && new Set(known.map((x) => x.src)).size > 1) {
    verdict = 'Отдача рассчитана разными способами. Сравнивайте её внутри одного источника.';
  } else if (known.length >= 2) {
    const best = known[0], worst = known[known.length - 1];
    if (best.share >= worst.share * 1.25) verdict = `Наибольшая оценка отдачи у ${best.name} (${best.who}) — ${f2(best.share)} ₽ на 1 ₽. Наименьшая у ${worst.name} (${worst.who}) — ${f2(worst.share)} ₽.`;
    else verdict = 'Все кампании с оценкой отдают рубль примерно одинаково — явного лидера нет.';
  }
  return { rows, verdict };
}
