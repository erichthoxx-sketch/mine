import { test } from 'node:test';
import assert from 'node:assert/strict';
import { manuscriptParas, serviceParas, chaptersOf, documentXml, isServiceTab } from '../writer/js/publish.js';
import { isChapterTitle } from '../writer/js/docedit.js';

// вкладка Docs API из строк: [текст, {bold, italic}, namedStyleType]
const tab = (title, lines) => ({ tabProperties: { title }, documentTab: { body: { content: lines.map(([t, ts = {}, n]) => ({ paragraph: { paragraphStyle: n ? { namedStyleType: n } : {}, elements: [{ textRun: { content: t + '\n', textStyle: ts } }] } })) } } });
const doc = { tabs: [
  tab('СИНОПСИС', [['СИНОПСИС'], ['Героиня бежит в горы.'], [''], ['Финал счастливый.']]),
  tab('Аннотация', [['Он оставил меня умирать.']]),
  tab('Цитаты', [['не в книгу']]),
  tab('Пролог', [['Пролог', {}, 'HEADING_1'], ['Снег шёл третий день.']]),
  tab('Глава 1', [['Глава 1.'], [''], ['Утро было ', {}], ['***'], ['Тихо.', { italic: true }]]),
  tab('Глава 2', [['Без заголовка внутри.']]),
  tab('От автора', [['Спасибо!']]),
] };

test('название главы', () => {
  assert.ok(isChapterTitle('Глава 3.') && isChapterTitle('Пролог') && isChapterTitle('Глава пятая. Утро'));
  assert.ok(!isChapterTitle('Главарь пришёл') && !isChapterTitle('Уголь зарычал низко'));
  assert.ok(isServiceTab('СИНОПСИС') && isServiceTab('Аннотация') && !isServiceTab('Глава 1'));
});

test('рукопись: только главы, название из первой строки, каждая с новой страницы', () => {
  const chs = chaptersOf(doc);
  assert.deepEqual(chs.map((c) => c.title), ['Пролог', 'Глава 1', 'Глава 2']);
  assert.equal(chs[1].paras.length, 3); // пустая строка убрана, «***» → «* * *»
  assert.deepEqual(chs[1].paras[1], { kind: 'center', runs: [{ t: '* * *' }] });
  assert.equal(chs[1].paras[2].runs[0].i, true);
  const m = manuscriptParas(doc, { title: 'Альпийский развод', author: 'Лана Фрейтаг' });
  assert.equal(m.chapters, 3);
  assert.deepEqual(m.paras.slice(0, 2).map((p) => p.kind), ['author', 'title']);
  assert.equal(m.paras.filter((p) => p.pageBreak).length, 3);
  assert.ok(!JSON.stringify(m.paras).includes('Спасибо') && !JSON.stringify(m.paras).includes('Героиня'));
});

test('синопсис и аннотация — из своих вкладок, без повтора слова «СИНОПСИС»', () => {
  const s = serviceParas(doc, 'synopsis', { title: 'Книга', author: 'Лана' });
  assert.equal(s.text, 'Героиня бежит в горы.\nФинал счастливый.');
  assert.equal(s.body.length, 2);
  assert.equal(serviceParas(doc, 'annotation', { title: 'Книга' }).text, 'Он оставил меня умирать.');
  const f = serviceParas(null, 'synopsis', { title: 'Книга', fallback: 'Свой текст' });
  assert.ok(f.found && f.text === 'Свой текст');
  assert.equal(serviceParas({ tabs: [] }, 'synopsis', { title: 'К' }).found, false);
});

test('XML документа: стили, разрыв страницы, экранирование', () => {
  const x = documentXml([{ kind: 'h', pageBreak: true, runs: [{ t: 'Глава <1> & «2»' }] }, { kind: 'p', runs: [{ t: 'a\nb', b: true }] }]);
  assert.ok(x.includes('<w:pStyle w:val="Heading1"/><w:pageBreakBefore/>'));
  assert.ok(x.includes('Глава &lt;1&gt; &amp; «2»'));
  assert.ok(x.includes('<w:rPr><w:b/></w:rPr><w:br/><w:t xml:space="preserve">b</w:t>'));
});
