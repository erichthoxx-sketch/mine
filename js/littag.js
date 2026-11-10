// Общая метка «Мой Литнет» (10.11.2026, владелица: «одна метка для сайта и таргета, обновлять из одного понятного места одной кнопкой
// и напоминание в Планер за день-два до конца срока»). Ссылка «Мой Литнет» живёт 30 дней: потом новые читательницы к автору не привязываются.
// Одна кнопка «Новая метка» в Мастерской → Сайт: метка встаёт во все ссылки сайта на Литнет (content.utm) и в «Параметры URL»
// всех единых кампаний Директа (меняется только utm_litref — кампании не переобучаются), всё пишется в «Что меняли» Директа.
// Хранится в настройках: settings.litTag { code, at, until, site, direct: { id кампании: код } }.
import { addDays } from './calc.js';

export const LITTAG_DAYS = 30, LITTAG_AHEAD = 2;
// Что вставила владелица: ссылку из кабинета (litnet.com/ref/КОД), ссылку с ?utm_litref=КОД, «utm_litref=КОД» или сам код
export function parseLitTag(input) {
  const s = String(input || '').trim();
  const m = /[?&]?utm_litref=([\w-]+)/i.exec(s) || /litnet\.com\/(?:\w+\/)?ref\/([\w-]+)/i.exec(s) || /^([\w-]{4,64})$/.exec(s);
  return m ? m[1] : null;
}
// Метка сайта: прежние параметры (utm_source=lanafreitag.ru…) остаются, utm_litref — новая
export function siteUtmWith(current = '', code = '') {
  const rest = String(current || '').replace(/^[^?]*\?/, '').split('&').map((x) => x.trim()).filter((x) => x && !/^utm_litref=/i.test(x));
  return [...rest, code ? 'utm_litref=' + code : ''].filter(Boolean).join('&');
}
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);
// Состояние метки: сколько дней осталось, пора ли менять
export function litTagInfo(settings = {}, today) {
  const t = settings.litTag;
  if (!t?.code) return null;
  const until = t.until || addDays(String(t.at || today).slice(0, 10), LITTAG_DAYS);
  const left = daysBetween(today, until);
  return { ...t, tag: 'utm_litref=' + t.code, until, left, soon: left <= LITTAG_AHEAD, late: left < 0, due: addDays(until, -LITTAG_AHEAD) };
}
// Дело в Планер: за 2 дня до конца (и до замены — висит на сегодня)
export function litTagTodo(settings = {}, today) {
  const i = litTagInfo(settings, today);
  if (!i || !i.soon) return null;
  return { date: i.due < today ? today : i.due, text: i.late ? `Метка Литнета истекла ${i.until.slice(8, 10)}.${i.until.slice(5, 7)} — новые читательницы не привязываются` : `Обновить метку Литнета — действует до ${i.until.slice(8, 10)}.${i.until.slice(5, 7)}`, until: i.until };
}
