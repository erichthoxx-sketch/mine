// Контекст для выводов о рекламе и читателях: что происходило в эти дни во всех приложениях.
// Сбои «не от меня» (события дня outage в «Доходах»), выход глав (Мастерская, w_books.pub), старт и конец рекламы
// (кампании «Доходов»), даты запусков. Только чистые функции — их проверяют тесты.
import { addDays, outageSet } from '../../js/calc.js';
import { pubMap } from '../../writer/js/wcalc.js';

// События по датам: [{date, kind: outage|chapter|adStart|adEnd, text}]
export function adEvents({ days = [], wbooks = [], campaigns = [], from, to }) {
  const out = [], add = (date, kind, text) => { if (date && date >= from && date <= to) out.push({ date, kind, text }); };
  for (const d of outageSet(days)) add(d, 'outage', 'сбой «не от меня»');
  for (const b of wbooks) {
    if (!b?.title) continue;
    for (const [ch, pfs] of Object.entries(pubMap(b))) {
      const first = Object.values(pfs).map((v) => v?.date).filter(Boolean).sort()[0]; // глава считается один раз — в первый день выхода
      add(first, 'chapter', `«${b.title}»: ${ch}`);
    }
  }
  for (const k of campaigns) { if (k.oneOff) continue; add(k.start, 'adStart', `старт рекламы «${k.name}»`); add(k.end, 'adEnd', `конец рекламы «${k.name}»`); }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// Две полные недели по вчера (как в аналитике): сколько вышло глав, дней сбоя, что было с рекламой
export function weekContext(ev, today) {
  const y = addDays(today, -1);
  const span = (a, b) => { const e = ev.filter((x) => x.date >= a && x.date <= b); return { chapters: e.filter((x) => x.kind === 'chapter').length, outage: e.filter((x) => x.kind === 'outage').length, adStart: e.filter((x) => x.kind === 'adStart').map((x) => x.text), adEnd: e.filter((x) => x.kind === 'adEnd').map((x) => x.text) }; };
  return { w: span(addDays(y, -6), y), pw: span(addDays(y, -13), addDays(y, -7)) };
}

// Почему изменились визиты — по фактам недели, а не догадкой (пусто — фактов нет)
export function visitReasons(cx, dir) {
  if (!cx) return [];
  const { w, pw } = cx, out = [];
  if (w.chapters !== pw.chapters && (dir < 0 ? w.chapters < pw.chapters : w.chapters > pw.chapters)) out.push(`глав вышло ${w.chapters} против ${pw.chapters} неделей раньше`);
  if (dir < 0 && w.adEnd.length) out.push(w.adEnd.join(', '));
  if (dir < 0 && pw.adEnd.length && !w.adStart.length) out.push(pw.adEnd.join(', ') + ' (на прошлой неделе)');
  if (dir > 0 && w.adStart.length) out.push(w.adStart.join(', '));
  if (w.outage || pw.outage) out.push(`дни сбоя не считались (${w.outage + pw.outage} дн.)`);
  return out;
}

// После сбоя Директ может перестраиваться: напоминание не делать выводов и не трогать настройки несколько дней
export function outageNotice(days, today, running = true) {
  if (!running) return null;
  const recent = [...outageSet(days)].filter((d) => d >= addDays(today, -6) && d <= today).sort();
  if (!recent.length) return null;
  const last = recent[recent.length - 1];
  return { last, n: recent.length, until: addDays(last, 5) };
}
