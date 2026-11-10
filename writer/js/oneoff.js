// Разовые правки данных по просьбе владелицы. Каждая выполняется один раз (метка в settings.oneoff),
// только когда с сервера пришли книги, события дней и настройки — иначе можно затереть чужие события дня.
import { pubMap, pubState, pubPlatforms, chapterList, scheduleDates } from './wcalc.js';
import { chapterEvent, syncFinish } from './sync.js';

// 10.11.2026: «Развод для черной вдовы» — новый график на Литнете (владелица перенесла сама):
// пролог и глава 1 вышли 09.11, главы 2–7 — на таймере 11, 13, 16, 18, 20, 23 ноября в 19:00,
// дальше — три раза в неделю: пн, ср, пт.
export const VDOVA = {
  key: 'vdovaSchedule1',
  title: /развод для черной вдовы/i,
  out: '2026-11-09',
  dates: { 2: '2026-11-11', 3: '2026-11-13', 4: '2026-11-16', 5: '2026-11-18', 6: '2026-11-20', 7: '2026-11-23' },
  days: [1, 3, 5],
};
const chNo = (t) => (/^\s*пролог/i.test(t) ? 0 : Number(/^\s*глава\s+(\d+)/i.exec(t)?.[1]) || null);

// Новый pub книги: что меняется (чистая функция, тест — tests/oneoff.test.js)
export function rescheduleBook(b, plan, today) {
  const pf = pubPlatforms(b)[0], pm = pubMap(b);
  const titles = [...new Set([...chapterList(b).map((t) => t.title), ...Object.keys(pm)])];
  const byNo = new Map(titles.filter((t) => chNo(t) != null).map((t) => [chNo(t), t]));
  const next = JSON.parse(JSON.stringify(pm)), changed = [];
  const at0 = (t) => Object.values(pm[t] || {}).map((v) => v?.at).filter(Boolean).sort()[0] || today;
  const set = (t, v) => { next[t] = { ...(next[t] || {}), [pf]: v }; changed.push({ ch: t, date: v.date }); };
  // пролог и глава 1 вышли — если в Мастерской они ещё не выложены
  for (const n of [0, 1]) {
    const t = byNo.get(n);
    const v = pm[t]?.[pf];
    if (t && (pubState(v, today) !== 'done' || v.planned || v.date > plan.out)) set(t, { date: plan.out, at: at0(t) });
  }
  // главы 2–7 — даты таймеров Литнета
  let last = plan.out;
  for (const [n, date] of Object.entries(plan.dates)) {
    last = date > last ? date : last;
    // главы ещё нет во вкладках Документа (уже на таймере Литнета) — отметка по названию «Глава N»
    const t = byNo.get(Number(n)) || 'Глава ' + n;
    if ( pm[t]?.[pf]?.date === date || pubState(pm[t]?.[pf], today) === 'done' && pm[t][pf].date <= today) continue;
    set(t, { date, planned: true, at: at0(t) });
  }
  // главы дальше, уже отложенные по старому графику, — на пн/ср/пт после последней даты
  const later = [...byNo.entries()].filter(([n, t]) => n > Math.max(...Object.keys(plan.dates).map(Number)) && pubState(pm[t]?.[pf], today) === 'wait')
    .sort((x, y) => x[0] - y[0]);
  const slots = scheduleDates(plan.out, plan.days, last > today ? last : today, later.length + 2).filter((d) => d > last);
  later.forEach(([, t], i) => { if (slots[i] && pm[t][pf].date !== slots[i]) set(t, { date: slots[i], planned: true, at: at0(t) }); });
  return { pf, pub: next, changed, pubDays: plan.days };
}

let busy = false;
export async function runOneoffs(app) {
  const st = app.store;
  if (busy || st.mode !== 'firebase' || !st.user || !st.settingsServerLoaded || !st.loaded?.w_books || !st.loaded?.days) return;
  const s = st.data.settings || {};
  if (s.oneoff?.[VDOVA.key]) return;
  const b = st.data.w_books.find((x) => VDOVA.title.test(x.title || ''));
  if (!b) return;
  busy = true;
  try {
    const c = app.ctx(), r = rescheduleBook(b, VDOVA, c.today);
    await st.patch('w_books', b.id, { pub: r.pub, published: null, pubDays: r.pubDays });
    for (const x of r.changed) await chapterEvent(c, b, x.ch, x.date, r.pf); // «Выкладка главы» в «Доходах» — на новые даты
    await syncFinish(c, { ...b, pub: r.pub, published: null });
    await st.saveSettings({ oneoff: { ...(s.oneoff || {}), [VDOVA.key]: new Date().toISOString() } });
    console.info('График «Черной вдовы» обновлён:', r.changed);
  } catch (e) { console.warn('Разовая правка графика:', e); }
  finally { busy = false; }
}
