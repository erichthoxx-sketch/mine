// Общее представление работы с внешними таргетологами.
// Только чтение контактов Мастерской: никакого изменения финансов и кампаний.
export function linkedTargetologists(data = {}, destination = 'direct') {
  const flag = destination === 'income' ? 'showIncome' : 'showDirect';
  return (data.w_links || [])
    .filter(x => x.kind === 'target' && x[flag] === true)
    .sort((a,b) => (a.partnerStatus === 'done') - (b.partnerStatus === 'done') ||
      (a.name || '').localeCompare(b.name || '', 'ru'));
}
export function targetReminders(x, today = '') {
  return (x.todos || []).filter(t => !t.done)
    .sort((a,b) => (a.date || '').localeCompare(b.date || ''))
    .map(t => ({ ...t, overdue: !!(today && t.date && t.date < today) }));
}
