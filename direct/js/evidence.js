// Единственная проверка пригодности конверсий к финансовым выводам.
// Директ иногда отдает расход, но не конверсии: нельзя смешивать разные даты.
export function conversionEvidence(stats = {}, today = '', { maxHours = 36 } = {}) {
  const checkedAt = stats.mAt || null;
  if (stats.mErr) return { ready: false, checkedAt, reason: 'Яндекс/Метрика не отдали свежие конверсии: ' + String(stats.mErr).slice(0, 250) };
  if (!checkedAt || !Number.isFinite(Date.parse(checkedAt))) return { ready: false, checkedAt, reason: 'Нет подтвержденной даты загрузки конверсий.' };
  const t = Date.parse(String(today || '') + 'T00:00:00Z');
  if (!Number.isFinite(t)) return { ready: false, checkedAt, reason: 'Неизвестна дата анализа.' };
  const ageHours = (t - Date.parse(checkedAt)) / 3600000;
  if (ageHours > maxHours) return { ready: false, checkedAt, reason: 'Данные о конверсиях устарели; обнови Директ.' };
  if (ageHours < -36) return { ready: false, checkedAt, reason: 'Дата конверсий находится в будущем относительно даты отчета.' };
  return { ready: true, checkedAt, reason: '' };
}
// Сбой учета может скрыть покупки, хотя рекламный расход был реальным.
export function missingConversionsDuringSpend(daily = [], from, to, skip = null, cid = null) {
  if (!skip?.size) return false;
  return daily.some((r) => r.date >= from && r.date <= to && skip.has(r.date) &&
    (cid == null || r.cid === cid) && Number(r.cost) > 0);
}
