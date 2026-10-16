// «Легенда» книги: идея, каркас по главам и персонажи. Чистые функции — без DOM и сети (их проверяют тесты).
// Хранится в книге: b.legend = { idea: {…}, plan: [{ id, title, what, why, pov, chars: [id] }], chars: [{ id, name, role, … }], sync: {…} }

export const IDEA_FIELDS = [
  ['logline', 'О чём книга — одной фразой', 'Бывшая жена возвращается в город, где её когда-то бросили умирать, — и встречает его снова'],
  ['genre', 'Жанр и тропы', 'любовный роман, второй шанс, от ненависти до любви, властный герой'],
  ['conflict', 'Главный конфликт', 'что мешает героям быть вместе — снаружи и внутри'],
  ['stakes', 'Что на кону', 'что героиня потеряет, если проиграет'],
  ['tone', 'Тон и атмосфера', 'горячо, с юмором, мрачно, уютно…'],
  ['ending', 'Финал', 'чем всё закончится — даже если пока примерно'],
  ['rules', 'Правила мира и важные факты', 'то, что нельзя нарушать: даты, имена, кто что знает'],
  ['notes', 'Заметки', 'всё остальное'],
];
export const ROLES = { heroine: 'Героиня', hero: 'Герой', villain: 'Антагонист', friend: 'Друг / подруга', family: 'Семья', side: 'Второстепенный' };
export const CHAR_FIELDS = [
  ['age', 'Возраст', 'например, 29'],
  ['look', 'Внешность', 'рост, глаза, волосы, стиль, особая примета'],
  ['nature', 'Характер', '3–5 черт: упрямая, ироничная, верная'],
  ['want', 'Чего хочет', 'цель в этой книге'],
  ['fear', 'Чего боится / рана', 'что сломало его в прошлом'],
  ['arc', 'Как меняется', 'каким был в начале → каким станет к финалу'],
  ['voice', 'Как говорит', 'словечки, манера, как обращается к другим'],
  ['links', 'Связи', 'бывший муж Анны, брат Ильи…'],
  ['notes', 'Заметки', ''],
];
export const LEGEND_TABS = { idea: 'Идея', plan: 'Каркас', chars: 'Персонажи' };

export const emptyLegend = () => ({ idea: {}, plan: [], chars: [] });
export const legendOf = (b) => ({ ...emptyLegend(), ...(b?.legend || {}) });
const nm = (x) => String(x || '').trim();
const charName = (L, id) => L.chars.find((c) => c.id === id)?.name || '';

// ---------- текст для нейросети ----------
// upTo — номер главы каркаса (1…): события до неё включительно и «что дальше»; 0 — весь каркас
export function legendContext(L, { title = '', upTo = 0 } = {}) {
  const out = [`# Легенда книги «${title}»`];
  const idea = IDEA_FIELDS.filter(([k]) => nm(L.idea?.[k])).map(([k, label]) => `- ${label}: ${nm(L.idea[k])}`);
  if (idea.length) out.push('', '## Идея', ...idea);
  if (L.chars.length) {
    out.push('', '## Персонажи');
    for (const c of L.chars) {
      const head = [ROLES[c.role], nm(c.age) ? `${nm(c.age)} лет` : ''].filter(Boolean).join(', ');
      out.push('', `### ${nm(c.name) || 'Без имени'}${head ? ` (${head})` : ''}`);
      for (const [k, label] of CHAR_FIELDS) if (k !== 'age' && nm(c[k])) out.push(`- ${label}: ${nm(c[k])}`);
    }
  }
  const plan = upTo > 0 ? L.plan.slice(0, upTo) : L.plan;
  if (plan.length) {
    out.push('', upTo > 0 ? (plan.length > 1 ? `## Каркас: главы 1–${plan.length}` : '## Каркас: глава 1') : '## Каркас по главам');
    plan.forEach((p, i) => {
      const extra = [nm(p.why) ? `зачем: ${nm(p.why)}` : '', p.pov ? `глазами: ${charName(L, p.pov)}` : '', (p.chars || []).length ? `в сцене: ${p.chars.map((id) => charName(L, id)).filter(Boolean).join(', ')}` : ''].filter(Boolean).join('; ');
      out.push(`${i + 1}. ${nm(p.title) || `Глава ${i + 1}`}${nm(p.what) ? ` — ${nm(p.what)}` : ''}${extra ? ` (${extra})` : ''}`);
    });
    const next = upTo > 0 ? L.plan[upTo] : null;
    if (next) out.push('', `## Пишем дальше: ${nm(next.title) || `Глава ${upTo + 1}`}`, nm(next.what) || '(план главы пока не заполнен)');
  }
  return out.join('\n');
}

// ---------- каркас из текста (вкладка «Каркас» в Документе) ----------
// «Глава 3. Встреча» / «3. Встреча» / «Пролог» — новая глава, строки под ней — что происходит
const HEAD = /^\s*((пролог|эпилог)(?![а-яё]).*|глава\s*\d+.*|\d{1,3}\s*[.)]\s*.+)$/i;
export function parsePlan(text, newId = () => Math.random().toString(36).slice(2, 9)) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
  const items = [], intro = [];
  if (lines.some((l) => HEAD.test(l))) {
    for (const l of lines) {
      if (!l) continue;
      if (HEAD.test(l)) {
        // «Глава 3. Встреча» → «Встреча» (номер — по порядку); «Пролог», «Глава 5» — как есть
        const t = l.replace(/^\d{1,3}\s*[.)]\s*/, '').replace(/[.:]\s*$/, '');
        items.push({ id: newId(), title: t.replace(/^глава\s*\d+\s*[.:—–-]\s*(?=\S)/i, ''), what: '' });
        continue;
      }
      if (items.length) items[items.length - 1].what = [items[items.length - 1].what, l].filter(Boolean).join('\n');
      else intro.push(l); // текст до первой главы — не теряем
    }
  } else {
    for (const para of String(text || '').split(/\n\s*\n/).map((x) => x.trim()).filter(Boolean)) items.push({ id: newId(), title: '', what: para });
  }
  const out = items.map((x) => ({ ...x, why: '', pov: '', chars: [] }));
  out.intro = intro.join('\n');
  return out;
}

// ---------- вкладки Документа: «Идея», «Каркас», «Персонажи» — абзацы для редактора Docs ----------
const H = (t, n = 'HEADING_2') => ({ st: { n }, runs: [{ t }] });
const P = (t) => ({ st: {}, runs: [{ t }] });
const LP = (label, t) => ({ st: {}, runs: [{ t: label + ': ', b: true }, { t }] });
export function legendBlocks(L, part) {
  const out = [];
  if (part === 'idea') for (const [k, label] of IDEA_FIELDS) { if (nm(L.idea?.[k])) out.push(LP(label, nm(L.idea[k]))); }
  if (part === 'plan') L.plan.forEach((p, i) => {
    out.push(H(!nm(p.title) ? `Глава ${i + 1}` : /^(пролог|эпилог|глава)(?![а-яё])/i.test(nm(p.title)) ? nm(p.title) : `${i + 1}. ${nm(p.title)}`, 'HEADING_3'));
    if (nm(p.what)) for (const l of nm(p.what).split('\n')) out.push(P(l));
    if (nm(p.why)) out.push(LP('Зачем', nm(p.why)));
    if (p.pov && charName(L, p.pov)) out.push(LP('Глазами', charName(L, p.pov)));
    const cs = (p.chars || []).map((id) => charName(L, id)).filter(Boolean);
    if (cs.length) out.push(LP('В сцене', cs.join(', ')));
  });
  if (part === 'chars') for (const c of L.chars) {
    out.push(H(`${nm(c.name) || 'Без имени'}${ROLES[c.role] ? ` — ${ROLES[c.role].toLowerCase()}` : ''}`, 'HEADING_3'));
    for (const [k, label] of CHAR_FIELDS) if (nm(c[k])) out.push(LP(label, nm(c[k])));
  }
  return out;
}
export const blocksPlain = (blocks) => blocks.map((p) => p.runs.map((r) => r.t).join('')).join('\n');
// сравнение текста вкладки: без лишних пробелов и пустых строк
export const normText = (t) => String(t || '').replace(/\r/g, '').split('\n').map((l) => l.trim()).filter(Boolean).join('\n');
export function hashText(t) { let h = 5381; const s = normText(t); for (let i = 0; i < s.length; i++) h = ((h * 33) ^ s.charCodeAt(i)) >>> 0; return h.toString(36); }
