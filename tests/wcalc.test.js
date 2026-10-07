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
