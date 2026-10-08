import test from 'node:test';
import assert from 'node:assert/strict';
import { findTab, contentToBlocks, blocksText, contentEnd, saveRequests, textStats, namedStylesOf } from '../writer/js/docedit.js';

const P = (s, e, elements, ps = {}) => ({ startIndex: s, endIndex: e, paragraph: { elements, paragraphStyle: ps } });
const R = (content, textStyle = {}) => ({ textRun: { content, textStyle } });
const content = [
  { endIndex: 1, sectionBreak: {} },
  P(1, 9, [R('Глава 1\n', { bold: true })], { namedStyleType: 'HEADING_1', alignment: 'CENTER' }),
  P(9, 22, [R('Он '), R('вернулся', { italic: true, underline: true }), R('.\n')], { indentFirstLine: { magnitude: 36, unit: 'PT' }, alignment: 'JUSTIFIED' }),
  P(22, 28, [R('Снег.\n', { strikethrough: true, fontSize: { magnitude: 14, unit: 'PT' } })], { indentFirstLine: { magnitude: 36, unit: 'PT' }, alignment: 'JUSTIFIED' }),
];
const doc = { tabs: [{ tabProperties: { tabId: 't1', title: 'Пролог' } }, { tabProperties: { tabId: 't2', title: 'Глава 1' }, documentTab: { body: { content }, namedStyles: { styles: [{ namedStyleType: 'NORMAL_TEXT', textStyle: { weightedFontFamily: { fontFamily: 'Times New Roman' }, fontSize: { magnitude: 12, unit: 'PT' } }, paragraphStyle: { lineSpacing: 115 } }] } }, childTabs: [{ tabProperties: { tabId: 't3', title: 'Заметки' } }] }] };

test('редактор: вкладка → абзацы со стилями Документа', () => {
  assert.equal(findTab(doc, 'Глава 1').tabProperties.tabId, 't2');
  assert.equal(findTab(doc, 't3').tabProperties.title, 'Заметки');
  const b = contentToBlocks(content);
  assert.deepEqual(b[0].st, { n: 'HEADING_1', a: 'CENTER' });
  assert.deepEqual(b[1].st, { a: 'JUSTIFIED', fi: 36 });
  assert.deepEqual(b[1].runs[1], { t: 'вернулся', b: false, i: true, u: true, s: false });
  assert.deepEqual(b[2].runs[0], { t: 'Снег.', b: false, i: false, u: false, s: true, z: 14 });
  assert.equal(blocksText(b), 'Глава 1\nОн вернулся.\nСнег.');
  assert.equal(contentEnd(content), 28);
  assert.deepEqual(textStats(b), { chars: 24, words: 5 });
  assert.equal(namedStylesOf(findTab(doc, 't2')).NORMAL_TEXT.run.f, 'Times New Roman');
});

test('редактор: сохранение — текст, оформление кусков и стили абзацев', () => {
  const b = contentToBlocks(content);
  const r = saveRequests(b, 't2', 28);
  assert.deepEqual(r[0], { deleteContentRange: { range: { startIndex: 1, endIndex: 27, tabId: 't2' } } });
  assert.equal(r[1].insertText.text, 'Глава 1\nОн вернулся.\nСнег.');
  const para = r.filter((x) => x.updateParagraphStyle).map((x) => [x.updateParagraphStyle.range.startIndex, x.updateParagraphStyle.range.endIndex, x.updateParagraphStyle.paragraphStyle.namedStyleType, x.updateParagraphStyle.paragraphStyle.alignment]);
  // заголовок 1..9, два одинаковых абзаца — одним запросом 9..27
  assert.deepEqual(para, [[1, 9, 'HEADING_1', 'CENTER'], [9, 27, 'NORMAL_TEXT', 'JUSTIFIED']]);
  const runs = r.filter((x) => x.updateTextStyle && x.updateTextStyle.fields !== 'bold,italic,underline,strikethrough,fontSize,weightedFontFamily');
  assert.deepEqual(runs.map((x) => [x.updateTextStyle.range.startIndex, x.updateTextStyle.range.endIndex, x.updateTextStyle.fields]), [[1, 8, 'bold'], [12, 20, 'italic,underline'], [22, 27, 'strikethrough,fontSize']]);
  assert.equal(saveRequests([{ st: {}, runs: [{ t: 'Текст', b: false, i: false, u: false, s: false }] }], 't1', 2)[0].insertText.text, 'Текст');
});
