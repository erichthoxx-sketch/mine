// Ознакомительный фрагмент для сайта — из той же рукописи, что для издательства (chaptersOf в publish.js):
// главы с начала до той, что бесплатна на Литнете. Формат — как в поле «Ознакомительный фрагмент» на сайте:
// строка-название главы («Пролог», «Глава 1»), дальше абзацы. Чистые функции.
export const LITNET_FREE_MAX = 200000; // правило Литнета: бесплатно в других местах — не больше 200 000 знаков

const paraText = (p) => (p.runs || []).map((r) => r.t || '').join('').replace(/\s*\n\s*/g, ' ').trim();

// upto — номер последней главы фрагмента (с нуля); главы — [{ title, paras, chars }]
export function fragText(chapters = [], upto = -1) {
  const out = [];
  for (const ch of chapters.slice(0, upto + 1)) {
    out.push(String(ch.title || '').split('\n')[0].trim());
    for (const p of (ch.paras || []).slice(p0(ch))) { const t = paraText(p); if (t) out.push(t); }
  }
  return out.join('\n');
}
// у главы первая строка — её название (kind 'h'): в тексте фрагмента оно уже есть
const p0 = (ch) => (ch.paras?.[0]?.kind === 'h' ? 1 : 0);
export const fragChars = (chapters = [], upto = -1) => chapters.slice(0, upto + 1).reduce((a, c) => a + (c.chars || 0), 0);
// сколько глав влезает в 200 000 знаков — подсказка, если ещё не выбирала
export function fitFree(chapters = [], max = LITNET_FREE_MAX) {
  let sum = 0, i = -1;
  for (const c of chapters) { if (sum + (c.chars || 0) > max) break; sum += c.chars || 0; i++; }
  return i;
}
