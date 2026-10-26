import test from 'node:test';
import assert from 'node:assert/strict';
import { legendContext, parsePlan, legendBlocks, blocksPlain, hashText } from '../writer/js/legend.js';

const L = {
  idea: { logline: 'Вдова мстит бывшему', genre: 'второй шанс' },
  chars: [{ id: 'a', name: 'Анна', role: 'heroine', age: '29', want: 'вернуть дом' }, { id: 'b', name: 'Илья', role: 'hero' }],
  plan: [{ id: '1', title: 'Похороны', what: 'Анна хоронит мужа', pov: 'a', chars: ['a', 'b'] }, { id: '2', title: 'Встреча', what: 'Илья возвращается', chars: [] }, { id: '3', title: 'Ссора', what: '', chars: [] }],
};

test('легенда: текст для нейросети — идея, персонажи, каркас до главы и «пишем дальше»', () => {
  const t = legendContext(L, { title: 'Развод', upTo: 1 });
  assert.match(t, /# Легенда книги «Развод»/);
  assert.match(t, /- О чём книга — одной фразой: Вдова мстит бывшему/);
  assert.match(t, /### Анна \(Героиня, 29 лет\)/);
  assert.match(t, /1\. Похороны — Анна хоронит мужа \(глазами: Анна; в сцене: Анна, Илья\)/);
  assert.ok(!/Ссора/.test(t));
  assert.match(t, /## Пишем дальше: Встреча\nИлья возвращается/);
});

test('легенда: каркас из текста вкладки «Каркас»', () => {
  let n = 0;
  const p = parsePlan('Мой план\nПролог\nОна у могилы\n\nГлава 1. Похороны\nАнна хоронит мужа\nвсе смотрят\n2) Встреча', () => String(++n));
  assert.deepEqual(p.map((x) => [x.title, x.what]), [['Пролог', 'Она у могилы'], ['Похороны', 'Анна хоронит мужа\nвсе смотрят'], ['Встреча', '']]);
  assert.equal(p.intro, 'Мой план');
  assert.equal(parsePlan('Глава 5\nбой')[0].title, 'Глава 5');
  assert.deepEqual(parsePlan('Первая сцена\n\nВторая сцена').map((x) => x.what), ['Первая сцена', 'Вторая сцена']);
});

test('легенда: вкладки Документа и сравнение текста', () => {
  const t = blocksPlain(legendBlocks(L, 'chars'));
  assert.match(t, /Анна — героиня\nВозраст: 29\nЧего хочет: вернуть дом\nИлья — герой/);
  assert.equal(hashText('а\n\n б '), hashText('а\nб'));
});

test('легенда: рабочий контекст — только утверждённое; полный — с пометками, вопросами и отвергнутым', async () => {
  const { legendContext } = await import('../writer/js/legend.js');
  const L2 = {
    idea: { logline: 'Вдова и мошенник' }, chars: [],
    plan: [{ id: '1', title: 'Похороны', what: 'Анна хоронит мужа' }, { id: '2', title: 'Долг', what: 'денежный долг', st: 'no' }, { id: '3', title: 'Убийство мошенника', what: 'кто-то убил', st: 'talk' }],
    questions: [{ id: 'q1', q: 'Как супруги раскрыли мошенника?', a: 'по выписке', st: 'ok' }, { id: 'q2', q: 'Финальная конфронтация?', a: '', st: 'open' }],
  };
  const w = legendContext(L2, { title: 'Вдова' });
  assert.match(w, /1\. Похороны — Анна хоронит мужа/);
  assert.ok(!/Долг|Убийство|Финальная/.test(w), w);
  assert.match(w, /## Решения \(утверждено\)\n- Как супруги раскрыли мошенника\? — по выписке/);
  const f = legendContext(L2, { title: 'Вдова', mode: 'full' });
  assert.match(f, /1\. Похороны \[утверждено\]/);
  assert.match(f, /2\. Убийство мошенника \[обсуждается\]/);
  assert.match(f, /## Открытые вопросы \(ещё не решено\)\n- Финальная конфронтация\?/);
  assert.match(f, /## Отвергнуто — не использовать\n- Долг — денежный долг/);
});

test('легенда: пролог без номера, главы после него — с 1', async () => {
  const { legendContext, legendBlocks, blocksPlain } = await import('../writer/js/legend.js');
  const L3 = { idea: {}, chars: [], plan: [{ id: 'p', title: 'Пролог', what: 'тайна' }, { id: '1', title: 'Похороны', what: 'Вера хоронит мужа' }] };
  const t = legendContext(L3, { title: 'Вдова' });
  assert.match(t, /\nПролог — тайна\n1\. Похороны — Вера хоронит мужа/);
  assert.match(blocksPlain(legendBlocks(L3, 'plan')), /^Пролог\nтайна\n1\. Похороны/);
});

test('шаблон для нейросети: идея, каркас, персонажи — туда и обратно', async () => {
  const { legendTemplate, applyTemplate } = await import('../writer/js/legend.js');
  let k = 0; const id = () => 'n' + (++k);
  const L0 = { idea: { logline: 'старое' }, chars: [{ id: 'a', name: 'Вера', role: 'heroine', age: '33' }], plan: [{ id: 'p1', title: 'Похороны', what: 'старое', pov: 'a', chars: ['a'] }], questions: [] };
  // идея: нейросеть ответила с жирными заголовками и своим текстом
  assert.match(legendTemplate(L0, 'idea', 'Вдова'), /## О чём книга — одной фразой\nстарое/);
  const ai1 = 'Вот заполненный шаблон:\n=== ИДЕЯ ===\n## О чём книга — одной фразой\nВдова находит мошенника\n**Читательское обещание**\nнапряжение и страсть\n## Финал\n\n';
  const r1 = applyTemplate(L0, 'idea', ai1);
  assert.equal(r1.legend.idea.logline, 'Вдова находит мошенника');
  assert.equal(r1.legend.idea.promise, 'напряжение и страсть');
  assert.equal(r1.n, 2);
  // каркас: пролог, главы со статусом, вопросы; у первой главы сохраняются «глазами» и «в сцене»
  const ai2 = '=== КАРКАС ===\n### Пролог\nЧто происходит: тайна\nЗачем: крючок\nСтатус: утверждено\n### Глава 1. Похороны\nЧто происходит: Вера хоронит мужа\nи видит чужого\nЗачем: завязка\nСтатус: обсуждается\n=== ОТКРЫТЫЕ ВОПРОСЫ ===\n- Как раскрыли мошенника? → по выписке\n- Финальная конфронтация?';
  const r2 = applyTemplate(L0, 'plan', ai2, id);
  assert.deepEqual(r2.legend.plan.map((p) => [p.title, p.what, p.st]), [['Пролог', 'тайна', 'ok'], ['Похороны', 'Вера хоронит мужа\nи видит чужого', 'talk']]);
  assert.equal(r2.legend.plan[0].pov, 'a');
  assert.deepEqual(r2.legend.questions.map((q) => [q.q, q.a]), [['Как раскрыли мошенника?', 'по выписке'], ['Финальная конфронтация?', '']]);
  // персонажи: обновить Веру, добавить нового
  const ai3 = '=== ПЕРСОНАЖИ ===\n### Вера\nРоль: Героиня\nВозраст: 34\nХарактер: упрямая\n### Артём — герой\nРоль: Герой\nВнешность: высокий';
  const r3 = applyTemplate(L0, 'chars', ai3, id);
  assert.equal(r3.legend.chars.length, 2);
  assert.equal(r3.legend.chars[0].age, '34'); assert.equal(r3.legend.chars[0].nature, 'упрямая');
  assert.deepEqual([r3.legend.chars[1].name, r3.legend.chars[1].role, r3.legend.chars[1].look], ['Артём', 'hero', 'высокий']);
  // шаблон → тот же шаблон обратно: ничего не теряется
  const L1 = r3.legend, back = applyTemplate(L1, 'chars', legendTemplate(L1, 'chars', 'Вдова'), id).legend;
  assert.deepEqual(back.chars.map((c) => [c.name, c.age, c.role]), L1.chars.map((c) => [c.name, c.age, c.role]));
});

test('ответ нейросети, скопированный из чата без # и ===, тоже разбирается', async () => {
  const { legendTemplate, applyTemplate } = await import('../writer/js/legend.js');
  let k = 0; const id = () => 'm' + (++k);
  const L0 = { idea: {}, chars: [{ id: 'a', name: 'Вера', role: 'heroine' }], plan: [], questions: [] };
  assert.match(legendTemplate(L0, 'chars', 'Вдова'), /в одном блоке кода \(plain text\)/);
  const r1 = applyTemplate(L0, 'idea', 'ИДЕЯ\nО чём книга — одной фразой\nВдова находит мошенника\nЖанр и тропы\nроман, враги — любовники\nФинал: свадьба');
  assert.deepEqual([r1.legend.idea.logline, r1.legend.idea.genre, r1.legend.idea.ending], ['Вдова находит мошенника', 'роман, враги — любовники', 'свадьба']);
  const r2 = applyTemplate(L0, 'plan', 'КАРКАС\nПролог\nЧто происходит: тайна\nЗачем: крючок\nСтатус: утверждено\n\nГлава 1. Похороны\nЧто происходит: Вера хоронит мужа\nЗачем: завязка\nСтатус: обсуждается\nОткрытые вопросы\n- Как раскрыли? → по выписке', id);
  assert.deepEqual(r2.legend.plan.map((p) => [p.title, p.what, p.st]), [['Пролог', 'тайна', 'ok'], ['Похороны', 'Вера хоронит мужа', 'talk']]);
  assert.deepEqual(r2.legend.questions.map((q) => [q.q, q.a]), [['Как раскрыли?', 'по выписке']]);
  const r3 = applyTemplate(L0, 'chars', 'ПЕРСОНАЖИ\n\nВера\nРоль: Героиня\nВозраст: 34\nХарактер: упрямая,\nно добрая\n\nАртём\nРоль: Герой\nВнешность: высокий\n\n(Роль — одно из: Героиня, Герой.)', id);
  assert.deepEqual(r3.legend.chars.map((c) => [c.name, c.role, c.age || '', c.nature || '', c.look || '']), [['Вера', 'heroine', '34', 'упрямая,\nно добрая', ''], ['Артём', 'hero', '', '', 'высокий']]);
});

test('Легенда для нейросети: экспорт каждой вкладки отдельно', () => {
  const idea = legendContext(L, { title: 'Развод', sections: ['idea'] });
  assert.match(idea, /## Идея/);
  assert.doesNotMatch(idea, /## Персонажи|## Каркас|## Синопсис/);

  const chars = legendContext(L, { title: 'Развод', sections: ['chars'] });
  assert.match(chars, /## Персонажи/);
  assert.match(chars, /Анна/);
  assert.doesNotMatch(chars, /## Идея|## Каркас|## Синопсис/);

  const plan = legendContext(L, { title: 'Развод', sections: ['plan'] });
  assert.match(plan, /## Каркас по главам/);
  assert.doesNotMatch(plan, /## Идея|## Персонажи|## Синопсис/);

  const syn = legendContext(L, { title: 'Развод', sections: ['syn'], synopsis: 'Героиня узнает тайну мужа.' });
  assert.match(syn, /## Синопсис\nГероиня узнает тайну мужа/);
  assert.doesNotMatch(syn, /## Идея|## Персонажи|## Каркас/);

  const all = legendContext(L, { title: 'Развод', sections: ['idea','plan','chars','syn'], synopsis: 'Синопсис романа.' });
  for (const section of ['Идея', 'Персонажи', 'Каркас по главам', 'Синопсис']) {
    assert.ok(all.includes('## ' + section), section);
  }
});

test('Экспорт пустой вкладки не подставляет чужие разделы', () => {
  const text = legendContext(L, { title: 'Развод', sections: ['syn'], synopsis: '' });
  assert.match(text, /Выбранный раздел пока не заполнен/);
  assert.doesNotMatch(text, /## Каркас|## Идея|## Персонажи/);
});

test('Полный режим при выборе персонажей не добавляет вопросы и отвергнутые главы', () => {
  const legends = { ...L, questions: [{ q: 'Вопрос?', a: 'Ответ', st: 'open' }],
    plan: [{ title: 'Отвергнутая сцена', st: 'no' }] };
  const text = legendContext(legends, { title: 'Развод', mode: 'full', sections: ['chars'] });
  assert.match(text, /## Персонажи/);
  assert.doesNotMatch(text, /Вопрос\\?|Отвергнутая сцена|Отвергнуто/);
});

test('каркас: «от какого лица» попадает в текст для нейросети', async () => {
  const { legendContext } = await import('../writer/js/legend.js');
  const L = { idea: {}, chars: [{ id: 'a', name: 'Вера', role: 'heroine' }], plan: [{ id: '1', title: 'Похороны', what: 'Вера хоронит мужа', pov: 'a', person: '1', st: 'ok' }], questions: [] };
  assert.match(legendContext(L, { title: 'Вдова' }), /глазами: Вера; от первого лица/);
});

test('акты: по порядку глав, в тексте для нейросети, во вкладке «Каркас» и обратно', async () => {
  const { actsOf, actName, legendContext, legendBlocks, blocksPlain, parsePlan } = await import('../writer/js/legend.js');
  const L = { idea: {}, chars: [], questions: [], plan: [{ id: 'a', title: 'Похороны', st: 'ok' }, { id: 'b', title: 'Сделка', st: 'ok' }, { id: 'c', title: 'Побег', st: 'ok' }],
    acts: [{ id: 'x2', from: 'c', title: 'Развязка' }, { id: 'x1', from: 'a', title: 'Завязка' }, { id: 'x3', from: 'нет-такой', title: '' }] };
  assert.deepEqual(actsOf(L).map((a) => [actName(a), a.i]), [['Акт 1. Завязка', 0], ['Акт 2. Развязка', 2]]);
  assert.match(legendContext(L, { title: 'Вдова' }), /Акт 1\. Завязка:\n1\. Похороны\n2\. Сделка\nАкт 2\. Развязка:\n3\. Побег/);
  const text = blocksPlain(legendBlocks(L, 'plan'));
  assert.match(text, /Акт 1\. Завязка\n1\. Похороны/);
  let k = 0; const items = parsePlan(text, () => 'n' + (++k));
  assert.deepEqual(items.map((x) => x.title), ['Похороны', 'Сделка', 'Побег']); // акт не стал главой и не попал в текст главы
  assert.deepEqual(items.acts, [{ title: 'Завязка', at: 0 }, { title: 'Развязка', at: 2 }]);
  assert.equal(items[1].what, '');
});
