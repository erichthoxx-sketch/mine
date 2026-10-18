import { test } from 'node:test';
import assert from 'node:assert/strict';
import { todoistTasks, todoistPlan, shortTitle } from '../writer/js/todoist.js';

const books = { b1: { id: 'b1', title: 'Альпийский развод. Он оставил меня умирать' } };
const items = [
  { date: '2026-10-10', kind: 'pub', title: 'Выложить «Глава 5»', sub: 'Альпийский развод · Литнет', book: 'b1', ch: 'Глава 5' },
  { date: '2026-10-11', kind: 'wait', title: '⏱ Глава 6 — выйдет сама', sub: '', to: '/book/b1' },
  { date: '2026-10-28', kind: 'money', title: 'Заплатить налог за сентябрь', sub: '≈ 1 454 ₽ · до 28-го' },
  { date: '2026-10-12', kind: 'waitans', title: 'Позвонить &quot;Эксмо&quot;', sub: 'Издательство', linkId: 'l1', todoK: 'k1' },
  { date: '2026-10-09', kind: 'mk', title: 'Маркетинг к старту', sub: '', to: '/mk/b1' },
];

test('пункты планера раскладываются по полочкам', () => {
  const w = todoistTasks(items, books);
  assert.equal(w.length, 4); // «выйдет сама» не отправляем
  assert.deepEqual([w[0].project, w[0].section], ['Книги', 'Альпийский развод']);
  assert.deepEqual([w[1].project, w[1].section], ['Мастерская', 'Деньги и реклама']);
  assert.equal(w[2].content, 'Позвонить "Эксмо"');
  assert.deepEqual([w[2].project, w[2].section], ['Мастерская', 'Связи']);
  assert.deepEqual([w[3].project, w[3].section], ['Книги', 'Альпийский развод']);
  assert.ok(w.every((x) => /^[a-z]+_[0-9a-z]+$/.test(x.key)));
  assert.equal(shortTitle('Звериная тропа для двоих'), 'Звериная тропа для двоих');
});

test('план синхронизации: создать, обновить, закрыть, не дублировать', () => {
  const w = todoistTasks(items, books);
  const [pub, tax, call, mk] = w;
  const map = { [pub.key]: { id: '1' }, [tax.key]: { id: '2' }, gone_x: { id: '9' } };
  const active = [
    { id: '1', content: pub.content, description: pub.description, due: { date: '2026-10-10' } }, // без изменений
    { id: '9', content: 'Старое', due: { date: '2026-10-09' } }, // в планере больше нет → закрыть
    { id: '5', content: mk.content, due: { date: mk.date } }, // такая уже есть (другое устройство) → взять
  ];
  const ops = todoistPlan(w, map, {}, active);
  assert.deepEqual(ops.verify.map((x) => x.w.key), [tax.key]); // id 2 нет среди открытых — проверим отдельно, закрыта ли
  assert.deepEqual(ops.close, [{ key: 'gone_x', id: '9' }]);
  assert.deepEqual(ops.create.map((x) => x.key), [call.key]);
  assert.deepEqual(ops.update.map((x) => [x.id, !!x.adopt]), [['5', true]]);
  // связь потерялась (ошибочно считалось «закрыто»), а задача на месте — подхватываем, а не забываем
  const healed = todoistPlan([mk], {}, { [mk.key]: '2026-10-09' }, [{ id: '5', content: mk.content, due: { date: mk.date } }, { id: '7', content: 'Устаревшее', due: { date: '2026-10-01' } }]);
  assert.deepEqual(healed.unclose, [mk.key]);
  assert.deepEqual(healed.close, [{ key: null, id: '7' }]); // наша задача, которой в планере нет, — закрыть
  // закрытое в Todoist заново не создаём
  assert.equal(todoistPlan(w, {}, { [call.key]: '2026-10-12' }, []).create.some((x) => x.key === call.key), false);
  // дата сдвинулась — обновить
  const moved = todoistPlan([{ ...pub, date: '2026-10-13' }], { [pub.key]: { id: '1' } }, {}, active);
  assert.equal(moved.update.length, 1);
});

test('идеи ⇄ Todoist: новые, правки с обеих сторон, удалённые, закрытые', async () => {
  const { ideasPlan } = await import('../writer/js/todoist.js');
  const ideas = [
    { id: 'a', title: 'Сцена в горах', text: '', tdId: '1', tdT: 'Сцена в горах', tdD: '' }, // без изменений
    { id: 'b', title: 'Старое', text: '', tdId: '2', tdT: 'Старое', tdD: '' }, // поменяли в Todoist
    { id: 'c', title: 'Новое здесь', text: 'текст', tdId: '3', tdT: 'Было', tdD: '' }, // поменяли в приложении
    { id: 'd', title: 'Удалила', tdId: '4', tdT: 'Удалила', tdD: '', deletedAt: '2026-10-10' },
    { id: 'e', title: 'Только в приложении' }, // отправить в Todoist
    { id: 'f', title: 'Закрыла в Todoist', tdId: '9', tdT: 'Закрыла в Todoist', tdD: '' },
  ];
  const tasks = [{ id: '1', t: 'Сцена в горах', d: '' }, { id: '2', t: 'Новое из Todoist', d: '' }, { id: '3', t: 'Было', d: '' }, { id: '4', t: 'Удалила', d: '' }, { id: '7', t: 'Сцена с санитарами', d: '' }];
  const ops = ideasPlan(ideas, tasks);
  assert.deepEqual(ops.create.map((t) => t.id), ['7']);
  assert.deepEqual(ops.pull.map((p) => p.x.id), ['b']);
  assert.deepEqual(ops.update.map((x) => x.id), ['c']);
  assert.deepEqual(ops.close.map((x) => x.id), ['d']);
  assert.deepEqual(ops.push.map((x) => x.id), ['e']);
  assert.deepEqual(ops.gone.map((x) => x.id), ['f']);
});

test('Todoist: задачу, которую Лана сама пометила «мастерская», приложение не закрывает', async () => {
  const { todoistPlan } = await import('../writer/js/todoist.js');
  const mine = { id: '900', content: 'Начать выкладку на Литгород', description: '', due: { date: '2026-10-12' } };
  const app = { id: '100', content: 'Выложить новую главу', description: 'старое', due: { date: '2026-10-28' } };
  // 100 — создано приложением (в списке made), но больше не нужно — закрываем; 900 — её собственная — не трогаем
  const ops = todoistPlan([], {}, {}, [mine, app], { 100: '2026-10-09' });
  assert.deepEqual(ops.close.map((x) => x.id), ['100']);
  // и не «усыновляем» её задачу как напоминание с тем же текстом
  const w = { key: 'k', content: 'Начать выкладку на Литгород', description: 'Звериная тропа для двоих · Литгород', date: '2026-10-12' };
  const ops2 = todoistPlan([w], {}, {}, [mine], {});
  assert.equal(ops2.update.length, 0);
  assert.equal(ops2.create.length, 1);
});

test('метки → полки: задача из «Входящих» сама переезжает на нужную полку', async () => {
  const { routeTasks } = await import('../writer/js/todoist.js');
  const projects = { 'входящие': 1, 'книги': 2, 'мастерская': 3 };
  const books = [{ title: 'Звериная тропа для двоих' }, { title: 'Развод для черной вдовы. Роман' }];
  const tasks = [
    { id: 'a', project_id: 1, content: 'Спросить Клод почему таргет выгорает', labels: ['мастерская'] },
    { id: 'b', project_id: 1, content: 'Написать пост', labels: ['мастерская'] },
    { id: 'c', project_id: 1, content: 'Сюжет про остров', labels: ['идея'] },
    { id: 'd', project_id: 1, content: 'Переписать пролог', labels: ['Развод_для_черной_вдовы'] },
    { id: 'e', project_id: 2, content: 'Обложка для Звериной тропы', labels: ['книги'], section_id: null },
    { id: 'f', project_id: 3, content: 'уже на месте', labels: ['мастерская'] },
    { id: 'g', project_id: 1, content: 'создано приложением', labels: ['мастерская'] },
    { id: 'h', project_id: 1, content: 'без меток', labels: [] },
    { id: 'i', project_id: 1, content: 'Оплатить налог', labels: ['доходы'] },
  ];
  const moves = routeTasks(tasks, { projects, books, made: { g: '1' } });
  assert.deepEqual(moves, [
    { id: 'a', project: 'Мастерская', section: 'Деньги и реклама' },
    { id: 'b', project: 'Мастерская', section: 'Дела' },
    { id: 'c', project: 'Книги', section: '' },
    { id: 'd', project: 'Книги', section: 'Развод для черной вдовы' },
    { id: 'i', project: 'Мастерская', section: 'Деньги и реклама' },
  ]);
});

test('важные задачи (p1, p2) и задачи про рекламу', async () => {
  const { isImportant, isMoneyTask, byDue } = await import('../js/tdtasks.js');
  assert.equal(isImportant({ pr: 4 }), true); assert.equal(isImportant({ pr: 2 }), true); assert.equal(isImportant({ pr: 1 }), false); assert.equal(isImportant({}), false);
  assert.equal(isMoneyTask({ p: 'Мастерская', s: 'Дела', t: 'Почему таргет выгорает' }), true);
  assert.equal(isMoneyTask({ p: 'Мастерская', s: 'Деньги и реклама', t: 'что-то' }), true);
  assert.equal(isMoneyTask({ p: 'Книги', s: '', t: 'реклама' }), false);
  assert.deepEqual([{ d: '' }, { d: '2026-10-20' }, { d: '2026-10-18' }].sort(byDue).map((x) => x.d), ['2026-10-18', '2026-10-20', '']);
});

test('синхронизация: задача «мастерская» из «Входящих» с приоритетом — переехала и видна как своя', async () => {
  const { syncTodoist } = await import('../writer/js/todoist.js');
  const db = {
    labels: [{ name: 'мастерская' }],
    projects: [{ id: 'p0', name: 'Входящие' }, { id: 'p1', name: 'Книги' }, { id: 'p2', name: 'Мастерская' }],
    sections: [{ id: 's1', name: 'Дела', project_id: 'p2' }],
    tasks: [{ id: 'a', project_id: 'p0', section_id: null, content: 'Спросить Клод почему таргет выгорает', labels: ['мастерская'], priority: 4, due: { date: '2026-10-18' } }],
  };
  const calls = [], orig = globalThis.fetch;
  const res = (x) => new Response(JSON.stringify(x), { status: 200, headers: { 'content-type': 'application/json' } });
  globalThis.fetch = async (url, o = {}) => {
    const u = new URL(url), path = u.pathname.replace('/api/v1', ''), body = o.body ? JSON.parse(o.body) : null;
    calls.push((o.method || 'GET') + ' ' + path);
    if (path === '/labels' && o.method === 'POST') { db.labels.push(body); return res(body); }
    if (path === '/labels') return res({ results: db.labels });
    if (path === '/projects') return res({ results: db.projects });
    if (path === '/sections' && o.method === 'POST') { const s = { id: 's' + (db.sections.length + 1), ...body }; db.sections.push(s); return res(s); }
    if (path === '/sections') { const pid = u.searchParams.get('project_id'); return res({ results: db.sections.filter((x) => !pid || x.project_id === pid) }); }
    if (path === '/tasks/filter') return res({ results: db.tasks.filter((t) => t.labels.includes('мастерская')) });
    if (path === '/tasks') return res({ results: db.tasks });
    const mv = /^\/tasks\/(\w+)\/move$/.exec(path);
    if (mv) { const t = db.tasks.find((x) => x.id === mv[1]); if (body.section_id) { t.section_id = body.section_id; t.project_id = db.sections.find((x) => x.id === body.section_id).project_id; } else t.project_id = body.project_id; return res(null); }
    return res({});
  };
  try {
    const r = await syncTodoist('T', [], { books: [] });
    const t = db.tasks[0], sec = db.sections.find((x) => x.id === t.section_id);
    assert.equal(t.project_id, 'p2'); assert.equal(sec.name, 'Деньги и реклама');
    assert.equal(r.state.own.length, 1);
    assert.deepEqual([r.state.own[0].p, r.state.own[0].s, r.state.own[0].pr], ['Мастерская', 'Деньги и реклама', 4]);
    assert.ok(!calls.some((c) => /close/.test(c))); // её задачу приложение не закрывает
    assert.ok(!('books' in r.state)); // список книг в настройки не сохраняется
    assert.deepEqual(db.labels.map((l) => l.name).sort(), ['доходы', 'идея', 'книги', 'мастерская']); // недостающие метки заведены
  } finally { globalThis.fetch = orig; }
});
