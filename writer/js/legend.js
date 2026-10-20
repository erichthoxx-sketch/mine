// «Легенда» книги: идея, каркас по главам и персонажи. Чистые функции — без DOM и сети (их проверяют тесты).
// Хранится в книге: b.legend = { idea: {…}, plan: [{ id, title, what, why, pov, chars: [id], st }], chars: [{ id, name, role, … }],
//   questions: [{ id, q, a, st: open|ok }], sync: {…} }

export const IDEA_FIELDS = [
  ['logline', 'О чём книга — одной фразой', 'кто герой, чего хочет и что ему мешает'],
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
  ['links', 'Связи', 'кто кому кем приходится'],
  ['notes', 'Заметки', ''],
];
export const LEGEND_TABS = { idea: 'Идея', plan: 'Каркас', chars: 'Персонажи' };

// статус сюжетного решения (главы каркаса): утверждено — канон; обсуждается — вариант; отвергнуто — не использовать.
// У старых глав статуса нет — это то, что уже было в каркасе, считаем утверждённым; новая глава — «обсуждается»
export const PLAN_ST = { ok: 'Утверждено', talk: 'Обсуждается', no: 'Отвергнуто' };
export const planSt = (p) => (PLAN_ST[p?.st] ? p.st : 'ok');
export const emptyLegend = () => ({ idea: {}, plan: [], chars: [], questions: [] });
export const legendOf = (b) => ({ ...emptyLegend(), ...(b?.legend || {}) });
const nm = (x) => String(x || '').trim();
const charName = (L, id) => L.chars.find((c) => c.id === id)?.name || '';

// ---------- текст для нейросети ----------
// mode: work — рабочий: только утверждённое (канон), персонажи, решения; full — полный: ещё варианты, открытые вопросы
// и отвергнутое — с пометками. upTo — номер главы каркаса (1…): события до неё включительно и «что дальше»; 0 — весь каркас
export function legendContext(L, { title = '', upTo = 0, mode = 'work' } = {}) {
  const full = mode === 'full', qs = L.questions || [];
  const out = [`# Легенда книги «${title}»`];
  if (full) out.push('', 'Пометки: [утверждено] — канон; [обсуждается] — предварительный вариант, не считать решённым; раздел «Отвергнуто» — не использовать.');
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
  const decided = qs.filter((q) => q.st === 'ok' && nm(q.q) && nm(q.a));
  if (decided.length) out.push('', '## Решения (утверждено)', ...decided.map((q) => `- ${nm(q.q)} — ${nm(q.a)}`));
  const line = (p, n) => {
    const extra = [nm(p.why) ? `зачем: ${nm(p.why)}` : '', p.pov ? `глазами: ${charName(L, p.pov)}` : '', (p.chars || []).length ? `в сцене: ${p.chars.map((id) => charName(L, id)).filter(Boolean).join(', ')}` : ''].filter(Boolean).join('; ');
    const mark = full ? (planSt(p) === 'ok' ? ' [утверждено]' : ' [обсуждается]') : '';
    return `${n}. ${nm(p.title) || `Глава ${n}`}${mark}${nm(p.what) ? ` — ${nm(p.what)}` : ''}${extra ? ` (${extra})` : ''}`;
  };
  // рабочий режим — только утверждённые главы; отвергнутые — никогда в каркасе (в полном — отдельным разделом)
  const keep = (p) => (full ? planSt(p) !== 'no' : planSt(p) === 'ok');
  const upto = upTo > 0 ? L.plan.slice(0, upTo) : L.plan;
  const plan = upto.filter(keep);
  if (plan.length) {
    out.push('', upTo > 0 ? (plan.length > 1 ? `## Каркас: главы 1–${plan.length}` : '## Каркас: глава 1') : '## Каркас по главам');
    plan.forEach((p, i) => out.push(line(p, i + 1)));
    const next = upTo > 0 ? L.plan.slice(upTo).find(keep) : null;
    if (next) out.push('', `## Пишем дальше: ${nm(next.title) || `Глава ${plan.length + 1}`}${full && planSt(next) !== 'ok' ? ' [обсуждается]' : ''}`, nm(next.what) || '(план главы пока не заполнен)');
  }
  if (full) {
    const open = qs.filter((q) => q.st !== 'ok' && nm(q.q));
    if (open.length) out.push('', '## Открытые вопросы (ещё не решено)', ...open.map((q) => `- ${nm(q.q)}${nm(q.a) ? ` — вариант: ${nm(q.a)}` : ''}`));
    const no = L.plan.filter((p) => planSt(p) === 'no');
    if (no.length) out.push('', '## Отвергнуто — не использовать', ...no.map((p) => `- ${nm(p.title) || 'Без названия'}${nm(p.what) ? ` — ${nm(p.what)}` : ''}`));
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
  if (part === 'plan') {
    const qs = (L.questions || []).filter((q) => nm(q.q));
    if (qs.length) {
      out.push(H('Открытые вопросы', 'HEADING_3'));
      for (const q of qs) out.push(P(`${q.st === 'ok' ? '✓ ' : '— '}${nm(q.q)}${nm(q.a) ? ` → ${nm(q.a)}` : ''}${q.st === 'ok' ? ' (утверждено)' : ''}`));
    }
  }
  if (part === 'plan') L.plan.forEach((p, i) => {
    const mark = planSt(p) === 'ok' ? '' : ` (${PLAN_ST[planSt(p)].toLowerCase()})`;
    out.push(H((!nm(p.title) ? `Глава ${i + 1}` : /^(пролог|эпилог|глава)(?![а-яё])/i.test(nm(p.title)) ? nm(p.title) : `${i + 1}. ${nm(p.title)}`) + mark, 'HEADING_3'));
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
