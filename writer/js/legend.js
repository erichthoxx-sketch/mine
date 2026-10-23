// «Легенда» книги: идея, каркас по главам и персонажи. Чистые функции — без DOM и сети (их проверяют тесты).
// Хранится в книге: b.legend = { idea: {…}, plan: [{ id, title, what, why, pov, chars: [id], st }], chars: [{ id, name, role, … }],
//   questions: [{ id, q, a, st: open|ok }], sync: {…} }

export const IDEA_FIELDS = [
  ['logline', 'О чём книга — одной фразой', 'кто герой, чего хочет и что ему мешает'],
  ['genre', 'Жанр и тропы', 'любовный роман, второй шанс, от ненависти до любви, властный герой'],
  ['conflict', 'Главный конфликт', 'что мешает героям быть вместе — снаружи и внутри'],
  ['stakes', 'Что на кону', 'что героиня потеряет, если проиграет'],
  ['tone', 'Тон и атмосфера', 'горячо, с юмором, мрачно, уютно…'],
  ['promise', 'Читательское обещание', 'ради каких эмоций и впечатлений читательница покупает эту историю'],
  ['unique', 'Главная особенность романа', 'что отличает его от десятков других любовных романов'],
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
export function formatCharacterAge(age) {
  const raw = String(age ?? '').trim().replace(/\s+/g, ' ');
  if (!raw) return '';
  const m = /^(\d{1,3})(?:\s*(?:год|года|лет)(?:\s+лет)?)?$/i.exec(raw);
  if (!m) return raw; // Произвольные пометки, например «около 30», не меняем.
  const n = Number(m[1]), mod100 = n % 100, mod10 = n % 10;
  const word = mod100 >= 11 && mod100 <= 14 ? 'лет' : mod10 === 1 ? 'год' : mod10 >= 2 && mod10 <= 4 ? 'года' : 'лет';
  return n + ' ' + word;
}
export const LEGEND_TABS = { idea: 'Идея', plan: 'Каркас', chars: 'Персонажи' };

// статус сюжетного решения (главы каркаса): утверждено — канон; обсуждается — вариант; отвергнуто — не использовать.
// У старых глав статуса нет — это то, что уже было в каркасе, считаем утверждённым; новая глава — «обсуждается»
export const PLAN_ST = { ok: 'Утверждено', talk: 'Обсуждается', no: 'Отвергнуто' };
export const planSt = (p) => (PLAN_ST[p?.st] ? p.st : 'ok');
// пролог и эпилог в каркасе — без номера; главы нумеруются по порядку с 1
export const isProl = (p) => /^\s*пролог(?![а-яё])/i.test(p?.title || '');
export const isEpil = (p) => /^\s*эпилог(?![а-яё])/i.test(p?.title || '');
// номер главы для показа: «Пролог»/«Эпилог» — null, остальные — 1, 2, 3…
export function chapterNums(plan) { let n = 0; return plan.map((p) => (isProl(p) || isEpil(p) ? null : ++n)); }
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
    return `${n ? `${n}. ` : ''}${nm(p.title) || `Глава ${n}`}${mark}${nm(p.what) ? ` — ${nm(p.what)}` : ''}${extra ? ` (${extra})` : ''}`;
  };
  // рабочий режим — только утверждённые главы; отвергнутые — никогда в каркасе (в полном — отдельным разделом)
  const keep = (p) => (full ? planSt(p) !== 'no' : planSt(p) === 'ok');
  const upto = upTo > 0 ? L.plan.slice(0, upTo) : L.plan;
  const plan = upto.filter(keep);
  if (plan.length) {
    out.push('', upTo > 0 ? (plan.length > 1 ? `## Каркас: главы 1–${plan.length}` : '## Каркас: глава 1') : '## Каркас по главам');
    const nums = chapterNums(plan);
    plan.forEach((p, i) => out.push(line(p, nums[i])));
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
    const n = chapterNums(L.plan)[i];
    out.push(H((!nm(p.title) ? `Глава ${n}` : /^(пролог|эпилог|глава)(?![а-яё])/i.test(nm(p.title)) ? nm(p.title) : `${n}. ${nm(p.title)}`) + mark, 'HEADING_3'));
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

// ---------- шаблон для нейросети: скачать/скопировать → нейросеть заполняет → загрузить обратно ----------
// Формат простой и устойчивый: поле — строка «## Название поля», под ней текст; глава/персонаж — «### …», внутри «Поле: текст».
const TPL_HEAD = { idea: 'ИДЕЯ', plan: 'КАРКАС', chars: 'ПЕРСОНАЖИ' };
const TPL_ASK = {
  idea: 'Заполни или улучши поля идеи книги.',
  plan: 'Распиши или доработай каркас по главам: для каждой главы — что происходит и зачем она нужна. Можно добавлять и менять главы.',
  chars: 'Заполни или доработай карточки персонажей. Можно добавить новых персонажей.',
};
const lowKey = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[*_#:«»"]/g, '').replace(/\s+/g, ' ').trim();
const ROLE_BY = Object.fromEntries(Object.entries(ROLES).map(([k, v]) => [lowKey(v), k]));
const ST_BY = { утверждено: 'ok', обсуждается: 'talk', отвергнуто: 'no' };
export function legendTemplate(L, part, title = '') {
  const out = [
    `Книга: «${title}». ${TPL_ASK[part]}`,
    'Правила ответа: верни ТОЛЬКО этот шаблон целиком, сохрани разметку — строки с ## и ### и названия полей перед двоеточием не меняй, новые поля не придумывай. Текст полей — по-русски, без markdown-оформления внутри.',
    'Верни ответ в одном блоке кода (plain text), сохранив все символы #, строки заголовков и названия полей. Не используй форматируемые блоки документов.',
    '',
    `=== ${TPL_HEAD[part]} ===`,
  ];
  if (part === 'idea') for (const [k, label] of IDEA_FIELDS) out.push('', `## ${label}`, nm(L.idea?.[k]));
  if (part === 'plan') {
    const nums = chapterNums(L.plan);
    const qs = L.questions || [];
    L.plan.forEach((p, i) => {
      out.push('', `### ${isProl(p) ? 'Пролог' : isEpil(p) ? 'Эпилог' : `Глава ${nums[i]}${nm(p.title) && !/^глава\s*\d+$/i.test(nm(p.title)) ? `. ${nm(p.title)}` : ''}`}`);
      out.push(`Что происходит: ${nm(p.what).replace(/\n+/g, ' ')}`, `Зачем: ${nm(p.why)}`, `Статус: ${PLAN_ST[planSt(p)].toLowerCase()}`);
    });
    if (!L.plan.length) out.push('', '### Пролог', 'Что происходит: ', 'Зачем: ', 'Статус: обсуждается', '', '### Глава 1. Название', 'Что происходит: ', 'Зачем: ', 'Статус: обсуждается');
    out.push('', '=== ОТКРЫТЫЕ ВОПРОСЫ ===', ...(qs.length ? qs.map((q) => `- ${nm(q.q)} → ${nm(q.a)}`) : ['- Вопрос → решение (если есть)']));
  }
  if (part === 'chars') {
    const list = L.chars.length ? L.chars : [{ name: 'Имя', role: 'heroine' }];
    for (const c of list) {
      out.push('', `### ${nm(c.name) || 'Имя'}`, `Роль: ${ROLES[c.role] || ''}`);
      for (const [k, label] of CHAR_FIELDS) out.push(`${label}: ${nm(c[k]).replace(/\n+/g, ' ')}`);
    }
    out.push('', `(Роль — одно из: ${Object.values(ROLES).join(', ')}.)`);
  }
  return out.join('\n');
}

// ответ нейросети → поля вкладки. Возвращает { legend: новая Легенда, n: сколько заполнено/изменено }
export function applyTemplate(L, part, text, newId = () => Math.random().toString(36).slice(2, 9)) {
  const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.replace(/^\s*>\s?/, '').trimEnd());
  const head = (l) => { const m = /^\s*#{2,3}\s*(.+?)\s*$/.exec(l) || /^\s*\*\*(.+?)\*\*\s*:?\s*$/.exec(l); return m ? m[1].replace(/\*\*/g, '').trim() : null; };
  const out = { ...L, idea: { ...(L.idea || {}) }, plan: [...(L.plan || [])], chars: [...(L.chars || [])], questions: [...(L.questions || [])] };
  let n = 0;
  if (part === 'idea') {
    const byLabel = Object.fromEntries(IDEA_FIELDS.map(([k, label]) => [lowKey(label), k]));
    let cur = null, buf = [];
    const flush = () => { if (cur && buf.join('\n').trim()) { const v = buf.join('\n').trim(); if (v !== nm(out.idea[cur])) { out.idea[cur] = v; n++; } } buf = []; };
    for (const l of lines) {
      const h = head(l);
      if (h != null) { flush(); cur = byLabel[lowKey(h)] || null; continue; }
      // при копировании из чата ## пропадают — заголовком считается строка с названием поля
      const bare = byLabel[lowKey(l.replace(/^\s*(?:[-*•]|\d+[.)])\s*/, ''))];
      if (bare) { flush(); cur = bare; continue; }
      const inl = /^\s*\**([^:*]{2,60}?)\**\s*:\s*(.+)$/.exec(l);
      if (inl && byLabel[lowKey(inl[1])]) { flush(); cur = byLabel[lowKey(inl[1])]; buf.push(inl[2]); continue; }
      if (/^===/.test(l.trim())) { flush(); cur = null; continue; }
      if (cur) buf.push(l);
    }
    flush();
  }
  // строки «Поле: текст» внутри блока ### (поле может продолжаться на следующих строках)
  const fieldsOf = (block, labels) => {
    const res = {}; let cur = null;
    for (const l of block) {
      const m = /^\s*[-*]?\s*\**([^:*]{2,60}?)\**\s*:\s*(.*)$/.exec(l), key = m ? labels[lowKey(m[1])] : null;
      if (key) { cur = key; res[key] = m[2].trim(); } else if (cur && l.trim() && !/^\s*\(.*\)\s*$/.test(l)) res[cur] = (res[cur] ? res[cur] + '\n' : '') + l.trim();
    }
    return res;
  };
  // заголовок вопросов — и без ===: «Открытые вопросы»
  const QHEAD = /^[\s=#*]*открытые вопросы[\s=#*:]*$/i;
  const fieldName = (l) => { const m = /^\s*[-*]?\s*\**([^:*]{2,60}?)\**\s*:/.exec(l); return m ? lowKey(m[1]) : null; };
  const blocks = (stopAt, first, titleRe) => {
    const res = []; let cur = null;
    lines.forEach((l, i) => {
      if (/^===/.test(l.trim()) || QHEAD.test(l)) { if (stopAt.test(l)) cur = null; return; }
      const m = /^\s*#{2,4}\s*(.+?)\s*$/.exec(l);
      let title = m ? m[1] : null;
      if (!title && l.trim() && l.trim().length <= 90 && !fieldName(l)) {
        const t = l.replace(/^\s*(?:[-*•]\s*)?/, '').replace(/\*\*/g, '').trim();
        const next = lines.slice(i + 1).find((x) => x.trim());
        if ((next && fieldName(next) === first) || (titleRe && titleRe.test(t))) title = t;
      }
      if (title) { cur = { title: title.replace(/\*\*/g, '').trim(), body: [] }; res.push(cur); return; }
      if (cur) cur.body.push(l);
    });
    return res;
  };
  if (part === 'plan') {
    const labels = { 'что происходит': 'what', зачем: 'why', статус: 'st' };
    const items = blocks(/ВОПРОС/i, 'что происходит', /^(пролог|эпилог|глава\s*\d+)(?=[\s.,:—–-]|$)/i).map((bk) => {
      const f = fieldsOf(bk.body, labels), t = bk.title;
      const title = /^пролог/i.test(t) ? 'Пролог' : /^эпилог/i.test(t) ? 'Эпилог' : t.replace(/^глава\s*\d+\s*[.:—–-]?\s*/i, '').trim() || t;
      return { title, what: f.what || '', why: f.why || '', st: ST_BY[lowKey(f.st)] || 'talk' };
    });
    if (items.length) {
      // главы по порядку: у существующих сохраняем «глазами»/«в сцене», остальное берём из ответа
      out.plan = items.map((x, i) => { const old = L.plan[i] || {}; return { id: old.id || newId(), pov: old.pov || '', chars: old.chars || [], ...x }; });
      n += items.length;
    }
    const qi = lines.findIndex((l) => /^===.*ВОПРОС/i.test(l.trim()) || QHEAD.test(l));
    if (qi >= 0) {
      const qs = [];
      for (const l of lines.slice(qi + 1)) {
        if (/^===/.test(l.trim())) break;
        const m = /^\s*[-*•]\s*(.+?)\s*(?:→|->|—>)\s*(.*)$/.exec(l) || /^\s*[-*•]\s*(.+)$/.exec(l);
        if (!m || /^вопрос\s*→\s*решение/i.test(m[0].replace(/^\s*[-*•]\s*/, ''))) continue;
        const q = m[1].trim(), a = (m[2] || '').trim(), old = out.questions.find((x) => lowKey(x.q) === lowKey(q));
        qs.push(old ? { ...old, a: a || old.a } : { id: newId(), q, a, st: 'open' });
      }
      if (qs.length) { const keep = out.questions.filter((x) => !qs.some((y) => y.id === x.id)); out.questions = [...keep, ...qs]; n += qs.length; }
    }
  }
  if (part === 'chars') {
    const labels = { роль: 'role', ...Object.fromEntries(CHAR_FIELDS.map(([k, label]) => [lowKey(label), k])) };
    for (const bk of blocks(/$^/, 'роль')) {
      const name = bk.title.replace(/\s*[—–-]\s*(героиня|герой|антагонист|друг.*|семья|второстепенный)\s*$/i, '').trim();
      if (!name || lowKey(name) === 'имя') continue;
      const f = fieldsOf(bk.body, labels), role = ROLE_BY[lowKey(f.role)] || '';
      delete f.role;
      const i = out.chars.findIndex((c) => lowKey(c.name) === lowKey(name));
      const v = { ...(i >= 0 ? out.chars[i] : { id: newId(), role: 'side' }), name, ...(role ? { role } : {}) };
      for (const [k] of CHAR_FIELDS) if (f[k] != null && f[k] !== '') v[k] = f[k];
      if (i >= 0) out.chars[i] = v; else out.chars.push(v);
      n++;
    }
  }
  return { legend: out, n };
}
