// «Крючки» (12.11.2026, идея «Д», её «да»): какой троп в объявлении кликают охотнее — по всем объявлениям и кампаниям.
// Троп определяется сам: по тропам книг из Мастерской и небольшому словарю (слово из тропа есть в заголовке или тексте);
// можно поправить одним выбором (settings.direct.hooks {id объявления: троп}). Сравнение — только при 1000+ показов и значимой разнице.
import { twoProp } from './mcalc.js';

export const HOOK_DICT = ['Развод', 'Измена', 'Опасный герой', 'Властный герой', 'Босс', 'Одержимость', 'Сильная героиня', 'Фиктивный брак', 'От ненависти до любви', 'Тайна', 'Месть', 'Юмор', 'Вдова', 'Беременность', 'Второй шанс', 'Криминал'];
const stems = (t) => String(t || '').toLowerCase().replace(/ё/g, 'е').split(/[^a-zа-я0-9]+/).filter((w) => w.length >= 4 && !['герой', 'героиня', 'любви', 'любовь', 'роман'].includes(w)).map((w) => w.slice(0, Math.max(4, w.length - 2)));
export function detectHook(ad, tags = []) {
  const hay = `${ad.title || ''} ${ad.title2 || ''} ${ad.text || ''}`.toLowerCase().replace(/ё/g, 'е');
  for (const t of [...tags, ...HOOK_DICT]) { const st = stems(t); if (st.length && st.every((x) => hay.includes(x))) return t; }
  for (const t of [...tags, ...HOOK_DICT]) { const st = stems(t); if (st.some((x) => hay.includes(x))) return t; }
  return '';
}
export function hookBoard({ ads = [], adDaily = [], tags = [], manual = {} }) {
  const by = {};
  for (const x of adDaily) { const v = (by[x.aid] ||= { impr: 0, clicks: 0 }); v.impr += x.impr; v.clicks += x.clicks; }
  const rows = ads.filter((a) => by[a.id]?.impr).map((a) => ({ aid: a.id, cid: a.cid, title: a.title || 'Объявление ' + a.id, text: a.text || '', state: a.state, ...by[a.id], ctr: by[a.id].clicks / by[a.id].impr, hook: manual[a.id] ?? detectHook(a, tags), auto: manual[a.id] == null }))
    .sort((x, y) => y.ctr - x.ctr);
  const g = {};
  for (const r of rows) { const v = (g[r.hook || ''] ||= { hook: r.hook || '', impr: 0, clicks: 0, n: 0 }); v.impr += r.impr; v.clicks += r.clicks; v.n++; }
  const groups = Object.values(g).map((x) => ({ ...x, ctr: x.clicks / x.impr })).sort((x, y) => y.ctr - x.ctr);
  const fair = groups.filter((x) => x.hook && x.impr >= 1000);
  let verdict = '';
  if (fair.length >= 2) { const a = fair[0], b = fair[fair.length - 1], t = twoProp(a.clicks, a.impr, b.clicks, b.impr);
    verdict = t.level !== 'low' ? `Лучше всего кликают на «${a.hook}»: CTR ${(a.ctr * 100).toFixed(1).replace('.', ',')} % против ${(b.ctr * 100).toFixed(1).replace('.', ',')} % у «${b.hook}» — и это не случайность. Новые объявления стоит делать вокруг этого тропа.` : 'Разница между тропами пока может быть случайной — нужно больше показов.'; }
  else verdict = rows.length ? 'Чтобы сравнить тропы, нужны хотя бы два разных с 1000+ показов у каждого. Делайте новые объявления на другие крючки — здесь будет видно, какой сильнее.' : '';
  return { rows, groups, verdict };
}
