// Итог месяца письмом (12.11.2026, идея «Б», её «да»): при первом открытии Мастерской в новом месяце она сама собирает прошлый месяц —
// написано, вышло глав, доход, реклама, пираты — и шлёт владелице через сервис писем (op: note, версия 8+). Один раз: settings.monthMailed.
import { mailSvc } from './views/mail.js';

import { prevMonth, monthSummary, monthLetter } from './monthcalc.js';

let armed = false;
export function autoMonthMail(app) {
  if (armed || typeof window === 'undefined' || app.store.mode !== 'firebase' || !(app.store.data?.w_books || []).length) return;
  armed = true;
  setTimeout(async () => {
    try {
      const c = app.ctx(), month = prevMonth(c.today);
      if (c.settings.monthMailed === month) return;
      for (let i = 0; i < 10 && !mailSvc().v; i++) await new Promise((r) => setTimeout(r, 1000));
      const m = mailSvc();
      if (!m.ready || m.v < 8) return;
      const s = monthSummary(c.data, month);
      if (!s.income && !s.chars && !s.chapters) return; // пустой месяц — письмо ни к чему
      const L = monthLetter(s), r = await m.call({ op: 'note', subject: L.subject, text: L.text });
      if (r?.ok) await app.store.saveSettings({ monthMailed: month });
    } catch (e) { console.warn('Итог месяца:', e); }
  }, 15000);
}
