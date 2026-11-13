// Письмо о новом романе — черновик сам (13.11.2026, её «да»): за 5 дней до первой главы новой книги Мастерская кладёт
// в Почту готовый черновик (её крючок и аннотация с сайта — ничего не выдумываем), в Планере — «Письмо о новом романе готово».
// Отправляет всегда она сама. Один раз на книгу: settings.site.autoDraft {книга: дата}. Чистая часть — newBookDue (тест).
import { loadMailCfg, saveMailCfg, loadSiteRaw, sameTitle } from '../../js/sitepub.js';

const add = (d, n) => new Date(Date.parse(d + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
// книги, у которых первая глава через 0–5 дней и ни одна ещё не вышла
export function newBookDue(wbooks = [], today, { ahead = 5 } = {}) {
  const out = [];
  for (const b of wbooks) {
    if (b.archived || (b.status || 'progress') !== 'progress') continue;
    const dates = Object.values(b.pub || {}).flatMap((ch) => Object.values(ch || {}).map((p) => p?.date && String(p.date).slice(0, 10))).filter(Boolean).sort();
    if (dates.some((d) => d < today)) continue; // книга уже идёт — писать только о новых романах
    const first = dates[0] || (b.publishStart >= today ? b.publishStart : '');
    if (first && first >= today && first <= add(today, ahead)) out.push({ id: b.id, title: b.title, first });
  }
  return out;
}
const mentions = (list, title) => (list || []).some((m) => String(m.subject || m.title || m.draft?.title || '').toLowerCase().includes(String(title || '').toLowerCase().slice(0, 12)));
export function draftFor(book, siteBook) {
  const lines = String(siteBook?.ann || '').split(/\n+/).map((x) => x.trim()).filter(Boolean);
  return { book: siteBook?.id || '', subject: `Новый роман: «${book.title}»`, eyebrow: 'Новый роман', title: `«${book.title}»`, text: [siteBook?.tagline || '', ...lines].filter(Boolean).join('\n\n'), btn: 'Читать', auto: book.id };
}

let armed = false;
export function autoNewBookDraft(app) {
  if (armed || typeof window === 'undefined' || app.store.mode !== 'firebase' || !(app.store.data?.w_books || []).length) return;
  armed = true;
  setTimeout(async () => {
    try {
      const c = app.ctx(), s = c.settings.site || {}, done = s.autoDraft || {};
      const due = newBookDue(c.data.w_books, c.today).filter((b) => !done[b.id] && !mentions(s.mailQueue, b.title) && !mentions(s.mailSent, b.title));
      if (!due.length) return;
      const u = app.store.auth?.currentUser; if (!u) return;
      const token = await u.getIdToken(), [cfg, raw] = await Promise.all([loadMailCfg(u.uid, token).catch(() => null), loadSiteRaw().catch(() => null)]);
      if (!cfg || !raw?.mailUrl) return; // Почта не подключена — черновик некуда класть
      const d = cfg.draft || {};
      if (d.subject || d.title || d.text) return; // начатое письмо не трогаем — попробуем, когда черновик освободится
      const b = due[0], sb = (raw.books || []).find((x) => sameTitle(x.title, b.title));
      await saveMailCfg(u.uid, token, { ...cfg, draft: draftFor(b, sb) });
      await app.store.saveSettings({ site: { ...(app.ctx().settings.site || {}), autoDraft: { ...done, [b.id]: b.first } } });
    } catch (e) { console.warn('Черновик письма о новом романе:', e); }
  }, 25000);
}
