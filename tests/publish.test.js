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

test('рукопись: только главы, название из первой строки, каждая с новой страницы, абзацы как в Документе', () => {
  const chs = chaptersOf(doc);
  assert.deepEqual(chs.map((c) => c.title), ['Пролог', 'Глава 1', 'Глава 2']);
  // «Глава 1.» — своим абзацем с новой страницы; пустая строка и «***» — как в Документе
  const g1 = chs[1].paras;
  assert.equal(g1[0].pageBreak, true);
  assert.deepEqual(g1.map((p) => p.runs.map((r) => r.t).join('')), ['Глава 1.', '', 'Утро было ', '***', 'Тихо.']);
  assert.equal(g1[4].runs[0].i, true);
  // у главы без названия внутри — название вкладки заголовком
  assert.deepEqual([chs[2].paras[0].kind, chs[2].paras[0].runs[0].t], ['h', 'Глава 2']);
  const m = manuscriptParas(doc, { title: 'Альпийский развод', author: 'Лана Фрейтаг' });
  assert.equal(m.chapters, 3);
  assert.deepEqual(m.paras.slice(0, 2).map((p) => p.kind), ['author', 'title']);
  assert.equal(m.paras.filter((p) => p.pageBreak).length, 3);
  assert.ok(!JSON.stringify(m.paras).includes('Спасибо') && !JSON.stringify(m.paras).includes('Героиня'));
});

test('отступы и интервалы абзаца — из Документа (свои и стиля «обычный текст»)', () => {
  const t = { tabProperties: { title: 'Глава 5' }, documentTab: {
    namedStyles: { styles: [{ namedStyleType: 'NORMAL_TEXT', paragraphStyle: { lineSpacing: 150, indentFirstLine: { magnitude: 36, unit: 'PT' } }, textStyle: {} }] },
    body: { content: [{ paragraph: { paragraphStyle: { alignment: 'JUSTIFIED', spaceBelow: { magnitude: 6, unit: 'PT' } }, elements: [{ textRun: { content: 'Текст.\n', textStyle: {} } }] } }] } } };
  const [ch] = chaptersOf({ tabs: [t] });
  const p = ch.paras[1];
  assert.deepEqual(p.ps, { a: 'JUSTIFIED', fi: 36, il: 0, sa: 0, sb: 6, ls: 150 });
  const x = documentXml([p]);
  assert.ok(x.includes('<w:spacing w:before="0" w:after="120" w:line="360" w:lineRule="auto"/><w:ind w:left="0" w:firstLine="720"/><w:jc w:val="both"/>'));
});

test('синопсис и аннотация — ровно текст своих вкладок', () => {
  const s = serviceParas(doc, 'synopsis');
  assert.equal(s.text, 'СИНОПСИС\nГероиня бежит в горы.\n\nФинал счастливый.');
  assert.equal(serviceParas(doc, 'annotation').text, 'Он оставил меня умирать.');
  const f = serviceParas(null, 'synopsis', { fallback: 'Свой текст' });
  assert.ok(f.found && f.text === 'Свой текст');
  assert.equal(serviceParas({ tabs: [] }, 'synopsis').found, false);
});

test('XML документа: стили, разрыв страницы, экранирование', () => {
  const x = documentXml([{ kind: 'h', pageBreak: true, runs: [{ t: 'Глава <1> & «2»' }] }, { kind: 'p', runs: [{ t: 'a\nb', b: true }] }]);
  assert.ok(x.includes('<w:pStyle w:val="Heading1"/><w:pageBreakBefore/>'));
  assert.ok(x.includes('Глава &lt;1&gt; &amp; «2»'));
  assert.ok(x.includes('<w:rPr><w:b/></w:rPr><w:br/><w:t xml:space="preserve">b</w:t>'));
});
