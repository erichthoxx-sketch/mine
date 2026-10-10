// Лимит НПД (2,4 млн ₽ в год): статус, напоминание и строка для карточки налога — общие для «Доходов» и «Мастерской»
import { npdLimitStatus, npdBaseFn, monthKey } from './calc.js';
import { rub, pct, fmtMonthIn } from './format.js';

export function npdStatusOf(sales, legacyDays, settings = {}, today) {
  return npdLimitStatus(npdBaseFn(sales, legacyDays, settings), today, { limit: Number(settings.npdLimit) || undefined, other: Number(settings.npdOther) || 0 });
}
// напоминание «везде» — когда лимит уже превышен или по прогнозу будет превышен в этом / следующем месяце
export function npdAlert(st, today) {
  if (!st) return null;
  if (st.level === 'over') return { level: 'over', title: `Лимит НПД за ${st.year} год превышен`, sub: `с 1 января ${rub(st.ytd, 0)} при лимите ${rub(st.limit, 0)} — право на НПД теряется; в течение 20 дней нужно перейти на другой режим (например, ИП на УСН)` };
  if (st.level === 'next') return { level: 'next', title: `Лимит НПД: по прогнозу превышение ${st.breach === monthKey(today) ? 'уже в этом месяце' : 'в следующем месяце'}`, sub: `в ${fmtMonthIn(st.breach)} · с 1 января ${rub(st.ytd, 0)} из ${rub(st.limit, 0)}, осталось ${rub(st.left, 0)} · темп ≈ ${rub(st.pace, 0)} в месяц` };
  return null;
}
// блок в карточке налога: сколько набралось за год и прогноз
export function npdBlock(st) {
  const cls = st.level === 'over' || st.level === 'next' ? 'bad' : st.level === 'later' || st.level === 'near' ? 'warn' : '';
  const note = st.level === 'over' ? 'Лимит превышен — право на НПД теряется, нужно перейти на другой режим в течение 20 дней.'
    : st.level === 'next' || st.level === 'later' ? `По темпу последних месяцев (≈ ${rub(st.pace, 0)} в месяц) лимит будет превышен в ${fmtMonthIn(st.breach)}.`
    : `По темпу последних месяцев к концу года ≈ ${rub(st.yearEnd, 0)} — в пределах лимита.`;
  return `<div class="npd"><div class="row between small"><span>Лимит НПД за ${st.year}: <b>${rub(st.ytd, 0)}</b> из ${rub(st.limit, 0)}</span><span class="${cls === 'bad' ? 'down' : 'muted'}">${pct(st.share, 0)}</span></div>
    <div class="progress npd-bar ${cls}"><i style="width:${Math.min(100, st.share * 100).toFixed(1)}%"></i></div>
    <div class="small ${cls === 'bad' ? 'down' : 'muted'}">${note}</div></div>`;
}
