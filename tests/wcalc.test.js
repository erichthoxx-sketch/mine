import test from 'node:test';
import assert from 'node:assert/strict';
import { countChars, charsFromDocsJson, charsFromDocxXml, recordProgress, charsAt, written, lastGain, pace, forecastDate, contestStatus, waitingStatus } from '../writer/js/wcalc.js';

test('знаки с пробелами без переносов строк', () => {
  assert.equal(countChars('Он ушёл.\nА я — нет.\n'), 18);
  assert.equal(countChars(''), 0);
});

test('Google Документ: вкладки-главы считаются отдельно и вместе', () => {
  const para = (t) => ({ paragraph: { elements: [{ textRun: { content: t } }] } });
  const doc = { tabs: [
    { tabProperties: { title: 'Глава 1' }, documentTab: { body: { content: [para('Привет, мир.\n'), para('Да.\n')] } } },
    { tabProperties: { title: 'Глава 2' }, documentTab: { body: { content: [para('Ещё\n')] } }, childTabs: [
      { tabProperties: { title: 'Глава 2.1' }, documentTab: { body: { content: [{ table: { tableRows: [{ tableCells: [{ content: [para('ab\n')] }] }] } }] } } },
    ] },
  ] };
  const r = charsFromDocsJson(doc);
  assert.deepEqual(r.tabs.map((t) => [t.title, t.chars]), [['Глава 1', 15], ['Глава 2', 3], ['Глава 2.1', 2]]);
  assert.equal(r.total, 20);
  // считаются только «Пролог», «Глава …», «Эпилог»; синопсис и заметки — нет
  const withNotes = { tabs: [{ tabProperties: { title: 'Синопсис' }, documentTab: { body: { content: [para('очень длинный синопсис\n')] } } }, { tabProperties: { title: 'Пролог' }, documentTab: { body: { content: [para('abc\n')] } } }, ...doc.tabs] };
  const r2 = charsFromDocsJson(withNotes);
  assert.equal(r2.total, 23); assert.equal(r2.tabs[0].counted, false); assert.equal(r2.tabs[1].counted, true);
  // старый документ без вкладок
  assert.equal(charsFromDocsJson({ title: 'X', body: { content: [para('abc\n')] } }).total, 3);
});

test('Word .docx: текст из <w:t>, сущности, табуляция', () => {
  const xml = '<w:body><w:p><w:r><w:t>Он сказал</w:t></w:r><w:r><w:t xml:space="preserve"> &quot;да&quot; &amp; ушёл</w:t></w:r></w:p><w:p><w:r><w:tab/><w:t>А</w:t></w:r></w:p></w:body>';
  assert.equal(charsFromDocxXml(xml), 'Он сказал "да" & ушёл'.length + 2);
});

test('история и прирост', () => {
  let h = {};
  h = recordProgress(h, '2026-10-01', 1000);
  h = recordProgress(h, '2026-10-03', 4000);
  h = recordProgress(h, '2026-10-05', 10000);
  assert.equal(charsAt(h, '2026-10-04'), 4000);
  assert.equal(written(h, '2026-10-05', 1), 0); // прошлое обновление — 03.10: прирост за 2 дня не «сегодня»
  assert.deepEqual(lastGain(h, '2026-10-05'), { date: '2026-10-03', gain: 6000 });
  assert.equal(written(recordProgress(h, '2026-10-06', 10500), '2026-10-06', 1), 500); // вчера была запись — считается
  assert.equal(written(h, '2026-10-06', 1), 0); // сегодня ещё не писала
  assert.equal(written(h, '2026-10-05', 7), 9000); // за неделю от первой записи
  assert.equal(written({ '2026-10-05': 50000 }, '2026-10-05', 1), 0); // первая запись — не «написано сегодня»
  assert.equal(pace(h, '2026-10-05', 14), 9000 / 4);
  assert.equal(forecastDate(h, '2026-10-05', 19000, 14), '2026-10-09');
  assert.equal(forecastDate(h, '2026-10-05', 5000), '2026-10-05');
  assert.equal(forecastDate({ '2026-10-05': 1 }, '2026-10-05', 5000), null);
});

test('конкурс: дни до конца, сколько писать в день, успеваю ли', () => {
  const book = { history: { '2026-10-01': 100000, '2026-10-05': 140000 } }; // 10 000 зн./день
  const c = { end: '2026-10-25', minChars: 300000 };
  const s = contestStatus(c, book, '2026-10-05');
  assert.equal(s.daysLeft, 20);
  assert.equal(s.need, 160000);
  assert.equal(s.perDay, 8000);
  assert.equal(s.forecast, '2026-10-21');
  assert.equal(s.onTrack, true);
  assert.equal(contestStatus({ ...c, end: '2026-10-15' }, book, '2026-10-05').onTrack, false);
  assert.equal(contestStatus(c, null, '2026-10-05').daysLeft, 20);
  assert.equal(contestStatus({ end: '2026-10-01' }, null, '2026-10-05').ended, true);
});

test('жду ответа: просрочка', () => {
  assert.deepEqual(waitingStatus({ since: '2026-09-20', remindDays: 14 }, '2026-10-05'), { days: 15, overdue: true });
  assert.equal(waitingStatus({ since: '2026-09-20', remindDays: 14, done: true }, '2026-10-05').overdue, false);
  assert.equal(waitingStatus({ since: '2026-10-01' }, '2026-10-05').overdue, false);
});

test('написано сегодня — от начала дня; вкладка «От автора» считается', async () => {
  const { writtenToday, isBookTab } = await import('../writer/js/wcalc.js');
  assert.equal(writtenToday({ chars: 12000, dayStart: { date: '2026-10-07', chars: 10500 }, history: { '2026-10-01': 5000 } }, '2026-10-07'), 1500);
  assert.equal(writtenToday({ chars: 12000, dayStart: { date: '2026-10-06', chars: 10500 }, history: { '2026-10-06': 10500, '2026-10-07': 12000 } }, '2026-10-07'), 1500); // старое начало дня — по истории
  assert.ok(isBookTab('От автора')); assert.ok(isBookTab('Эпилог')); assert.ok(isBookTab('Глава 12. Гроза')); assert.ok(!isBookTab('Синопсис'));
});

test('написано за 7 дней — от начала недели', async () => {
  const { writtenWeek } = await import('../writer/js/wcalc.js');
  assert.equal(writtenWeek({ chars: 20000, weekStart: { date: '2026-10-07', chars: 12000 }, history: { '2026-10-07': 20000 } }, '2026-10-07'), 8000);
  assert.equal(writtenWeek({ chars: 20000, history: { '2026-09-30': 15000, '2026-10-07': 20000 } }, '2026-10-07'), 5000); // без версий — по истории
});

test('выкладка глав: старое поле, площадки, отложенная публикация', async () => {
  const { pubMap, pubState, chapterOutDates, plannedPubs, pubPlatforms } = await import('../writer/js/wcalc.js');
  const b = { platforms: ['Литмаркет', 'Литнет'], published: { 'Глава 1': '2026-10-01' }, pub: { 'Глава 2': { 'Литнет': { date: '2026-10-10', planned: true }, 'Литмаркет': { date: '2026-10-05' } }, 'Глава 1': { 'Литмаркет': { date: '2026-10-02' } } } };
  const m = pubMap(b);
  assert.deepEqual(Object.keys(m['Глава 1']).sort(), ['Литмаркет', 'Литнет']);
  assert.equal(pubState(m['Глава 2']['Литнет'], '2026-10-07'), 'wait');
  assert.equal(pubState(m['Глава 2']['Литнет'], '2026-10-10'), 'done');
  assert.deepEqual(chapterOutDates(b, '2026-10-07'), { 'Глава 1': '2026-10-01', 'Глава 2': '2026-10-05' });
  assert.deepEqual(plannedPubs(b, '2026-10-07'), [{ ch: 'Глава 2', pf: 'Литнет', date: '2026-10-10' }]);
  assert.deepEqual(plannedPubs(b, '2026-10-10'), []);
  assert.deepEqual(pubPlatforms(b), ['Литнет', 'Литмаркет']);
  // снятая отметка (null) убирает и старую
  assert.equal(pubMap({ published: { 'Глава 1': '2026-10-01' }, pub: { 'Глава 1': { 'Литнет': null } } })['Глава 1'], undefined);
});

test('график выкладки: пн/ср/пт, «выложить до» и следующая глава считаются сами', async () => {
  const { scheduleDates, bookSchedule } = await import('../writer/js/wcalc.js');
  // 2026-10-05 — понедельник
  assert.deepEqual(scheduleDates('2026-10-05', [1, 3, 5], '2026-10-05', 4), ['2026-10-05', '2026-10-07', '2026-10-09', '2026-10-12']);
  const tabs = ['Пролог', 'Глава 1', 'Глава 2', 'Глава 3'].map((title) => ({ title, chars: 10000 }));
  const b = { platforms: ['Литнет'], tabs, chars: 40000, planChapters: 6, publishStart: '2026-10-05', pubDays: [1, 3, 5],
    pub: { 'Пролог': { 'Литнет': { date: '2026-10-05' } }, 'Глава 1': { 'Литнет': { date: '2026-10-09', planned: true } } } };
  const s = bookSchedule(b, '2026-10-07');
  // ср 07.10 не закрыта (ничего не выходило после пн) → напоминание о Главе 2
  assert.deepEqual(s.next, { date: '2026-10-07', ch: 'Глава 2', pf: 'Литнет' });
  // осталось 4 главы: 07.10, (09.10 занята таймером), 12.10, 14.10, 16.10
  assert.equal(s.remaining, 4); assert.equal(s.untilAuto, '2026-10-16');
  // выложила в ср заранее во вторник — среда закрыта
  const b2 = { ...b, pub: { ...b.pub, 'Глава 2': { 'Литнет': { date: '2026-10-06' } } } };
  assert.equal(bookSchedule(b2, '2026-10-07').next.date, '2026-10-12');
  // ручная дата важнее
  assert.equal(bookSchedule({ ...b, publishUntil: '2026-12-01' }, '2026-10-07').until, '2026-12-01');
  // без плана глав «до» не считается
  assert.equal(bookSchedule({ ...b, planChapters: null }, '2026-10-07').untilAuto, null);
});

test('отложить главы по графику: каждой свой день, занятые дни пропускаются', async () => {
  const { planBySchedule } = await import('../writer/js/wcalc.js');
  const tabs = ['Глава 12', 'Глава 13', 'Глава 14', 'Глава 15'].map((title) => ({ title, chars: 1 }));
  const b = { platforms: ['Литнет'], tabs, publishStart: '2026-09-01', pubDays: [1, 3, 5], pub: { 'Глава 12': { 'Литнет': { date: '2026-10-09', planned: true } } } };
  // пт 09.10 занята Главой 12 → 13-я на пн 12.10, 14-я на ср 14.10, 15-я на пт 16.10
  assert.deepEqual(planBySchedule(b, ['Глава 15', 'Глава 13', 'Глава 14'], '2026-10-08', 'Литнет'), [
    { ch: 'Глава 13', date: '2026-10-12' }, { ch: 'Глава 14', date: '2026-10-14' }, { ch: 'Глава 15', date: '2026-10-16' }]);
  // перепланировать саму Главу 12 — её день свободен для неё
  assert.equal(planBySchedule(b, ['Глава 12', 'Глава 13'], '2026-10-08', 'Литнет')[0].date, '2026-10-09');
});

test('написано за месяц: история началась в этом месяце — по версиям файла, не меньше сегодняшнего', async () => {
  const { writtenMonth } = await import('../writer/js/wcalc.js');
  const t = '2026-10-07';
  assert.equal(writtenMonth({ chars: 300000, history: { '2026-09-28': 250000, [t]: 300000 } }, t), 50000);
  assert.equal(writtenMonth({ chars: 300000, history: { [t]: 300000 }, monthStart: { date: t, chars: 240000 } }, t), 60000);
  assert.equal(writtenMonth({ chars: 300000, history: { [t]: 300000 }, dayStart: { date: t, chars: 261225 } }, t), 38775);
});

test('цели: главы к сроку считаются по отметкам (выложила / на таймере); своя цель — отметки', async () => {
  const { goalStatus, goalDaysLeft, dailyWritten } = await import('../writer/js/wcalc.js');
  const t = '2026-10-07';
  const tabs = Array.from({ length: 19 }, (_, i) => ({ title: 'Глава ' + (i + 1), chars: 16000 }));
  const pub = {};
  for (let i = 1; i <= 11; i++) pub['Глава ' + i] = { 'Литнет': { date: '2000-01-01', past: true } };
  pub['Глава 12'] = { 'Литнет': { date: t, at: t } };
  const book = { platforms: ['Литнет'], tabs, chars: 304000, planChapters: 25, pub, history: { '2026-10-06': 290000, [t]: 304000 }, dayStart: { date: t, chars: 290000 } };
  const g = { type: 'finish', bookId: 'b', deadline: '2026-10-15', perDay: 1 };
  assert.equal(goalDaysLeft(g, t), 9);
  let s = goalStatus(g, book, t);
  assert.equal(s.left, 13); assert.equal(s.todayCh, 1); assert.equal(s.doneToday, true);
  assert.ok(Math.abs(s.needPerDay - 13 / 9) < 1e-9); // по главе в день к 15.10 не успеть
  // главу 13 поставила на таймер сегодня — засчитывается сегодня
  s = goalStatus({ ...g, perDay: 2 }, { ...book, pub: { ...pub, 'Глава 13': { 'Литнет': { date: '2026-10-09', planned: true, at: t } } } }, t);
  assert.equal(s.todayCh, 2); assert.equal(s.doneToday, true);
  // ничего не отметила
  s = goalStatus(g, { ...book, pub: { 'Глава 1': { 'Литнет': { date: '2000-01-01', past: true } } } }, t);
  assert.equal(s.doneToday, false); assert.equal(s.needToday, 1);
  assert.equal(goalDaysLeft({ ...g, days: [1, 2, 3, 4, 5] }, t), 7);
  assert.equal(goalStatus({ type: 'custom', checks: { [t]: true } }, null, t).doneToday, true);
  assert.deepEqual(dailyWritten(book, '2026-10-06', t, t).map((x) => [x.value, x.known]), [[0, false], [14000, true]]);
});

test('авторские листы: формат и ввод', async () => {
  const { alNum, fromAl } = await import('../writer/js/wcalc.js');
  assert.equal(alNum(299743), '7,5'); assert.equal(alNum(38764), '0,97'); assert.equal(alNum(400000), '10');
  assert.equal(alNum(0), '0'); assert.equal(alNum(100), '< 0,01'); assert.equal(alNum(16000), '0,4');
  assert.equal(fromAl('7,5'), 300000); assert.equal(fromAl(''), null);
});

test('конкурс из текста условий: название, даты, объём, площадка', async () => {
  const { parseContest } = await import('../writer/js/wcalc.js');
  const t = `Литературный конкурс «Второе дыхание»
Приём работ с 15 октября по 30 ноября 2026 года. Итоги — 20 декабря.
Объём произведения — от 6 до 12 а.л. Произведение должно быть новым.`;
  const { volNote, ...r } = parseContest(t, 'https://litnet.com/ru/contest/123', '2026-10-10');
  assert.ok(volNote.includes('от 6 до 12 а.л.'));
  assert.deepEqual(r, { platform: 'Литнет', name: 'Второе дыхание', results: '2026-12-20', start: '2026-10-15', end: '2026-11-30', unit: 'al', minChars: 240000, maxChars: 480000 });
  const r2 = parseContest('Конкурс "Тёмная сторона". Последний день подачи: 01.12.2026. Объём не менее 200 000 знаков с пробелами.', '', '2026-10-10');
  assert.equal(r2.name, 'Тёмная сторона');
  assert.equal(r2.end, '2026-12-01');
  assert.deepEqual([r2.unit, r2.minChars, r2.maxChars], ['chars', 200000, undefined]);
  const r3 = parseContest('Конкурс «Зимняя сказка» на Author.Today, до 15 января. Объём до 120 тыс. знаков', '', '2026-11-20');
  assert.deepEqual([r3.platform, r3.end, r3.maxChars, r3.unit], ['Author.Today', '2027-01-15', 120000, 'chars']);
});

test('конкурс: условия как на странице Литнета (диапазон чисел, итоги, жанры, почта)', async () => {
  const { parseContest } = await import('../writer/js/wcalc.js');
  const t = `Правила конкурса
Срок приема работ
31.07.2026 - 31.10.2026
Оглашение результатов
До 30.11.2026
Размер книги
От 30 000 знаков
Жанры
Все жанры
Вы когда-нибудь воображали...
«Литнет», издательство Cherry Books, а также городское медиа Time Out запускает конкурс романов «Второе дыхание» — истории о тех, кому судьба дала еще один шанс.
Вопросы — на contest@litnet.com.`;
  const r = parseContest(t, '', '2026-10-10');
  assert.equal(r.name, 'Второе дыхание');
  assert.deepEqual([r.start, r.end, r.results], ['2026-07-31', '2026-10-31', '2026-11-30']);
  assert.deepEqual([r.unit, r.minChars], ['chars', 30000]);
  assert.equal(r.genres, 'Все жанры');
  assert.deepEqual(r.emails, ['contest@litnet.com']);
  assert.equal(r.platform, 'Литнет');
});

test('конкурс: сокращённые месяцы, правила выкладки — не объём, имя файла, первые главы', async () => {
  const { parseContest } = await import('../writer/js/wcalc.js');
  const t = `Литнет
Книги
Второе дыхание
Конкурс на лучший роман о втором шансе
Срок приема работ
31 июл. 2026 - 31 окт. 2026
Оглашение результатов
До 30 нояб. 2026
Размер книги
От 30 000 знаков
Новые главы выкладывайте регулярно, до 100 000 знаков в неделю.
Отправьте первые три главы и синопсис в формате docx. Файл назовите так: ВторойШанс_Фамилия_Название.`;
  const r = parseContest(t, 'https://litnet.com/ru/contests/vtoroe-dyhanie-c150', '2026-10-10');
  assert.equal(r.name, 'Второе дыхание');
  assert.deepEqual([r.start, r.end, r.results], ['2026-07-31', '2026-10-31', '2026-11-30']);
  assert.deepEqual([r.unit, r.minChars, r.maxChars], ['chars', 30000, undefined]);
  assert.equal(r.fileTpl, 'ВторойШанс_Фамилия_Название');
  assert.equal(r.chapters, 3);
  assert.deepEqual(r.formats, ['docx']);
  const r2 = parseContest('Объём на момент подачи — не менее 30 000 знаков, к окончанию приёма работ — не менее 6 а.л.', '', '2026-10-10');
  assert.deepEqual([r2.unit, r2.minChars, r2.startChars], ['al', 240000, 30000]);
});

test('календарь конкурсов: список из поста — по абзацам, месяц без дат — примерно', async () => {
  const { parseContestList } = await import('../writer/js/wcalc.js');
  const r = parseContestList(`Календарь конкурсов на год

«Зимняя сказка» — приём работ с 10 января по 10 марта, итоги 10 апреля.

«История его служанки» — приём до 27 октября 2026, итоги до 27 ноября.

Конкурс «Летний роман» стартует в июне.`, '2026-10-11');
  assert.deepEqual(r.map((x) => [x.name, x.start || '', x.end, x.results || '', !!x.approx]), [
    ['Зимняя сказка', '2027-01-10', '2027-03-10', '2027-04-10', false],
    ['История его служанки', '', '2026-10-27', '2026-11-27', false],
    ['Летний роман', '2027-06-01', '2027-06-30', '', true],
  ]);
});
