import test from 'node:test';
import assert from 'node:assert/strict';
import { findTab, contentToBlocks, blocksText, contentEnd, saveRequests } from '../writer/js/docedit.js';

const content = [
  { endIndex: 1, sectionBreak: {} },
  { startIndex: 1, endIndex: 14, paragraph: { elements: [{ textRun: { content: 'Он ', textStyle: {} } }, { textRun: { content: 'вернулся', textStyle: { bold: true } } }, { textRun: { content: '.\n', textStyle: {} } }] } },
  { startIndex: 14, endIndex: 22, paragraph: { elements: [{ textRun: { content: 'Снег.\n', textStyle: { italic: true } } }] } },
];
const doc = { tabs: [{ tabProperties: { tabId: 't1', title: 'Пролог' } }, { tabProperties: { tabId: 't2', title: 'Глава 1' }, documentTab: { body: { content } }, childTabs: [{ tabProperties: { tabId: 't3', title: 'Заметки' } }] }] };

test('редактор: вкладка → абзацы с жирным и курсивом', () => {
  assert.equal(findTab(doc, 'Глава 1').tabProperties.tabId, 't2');
  assert.equal(findTab(doc, 't3').tabProperties.title, 'Заметки');
  const b = contentToBlocks(content);
  assert.deepEqual(b, [{ runs: [{ t: 'Он ', b: false, i: false }, { t: 'вернулся', b: true, i: false }, { t: '.', b: false, i: false }] }, { runs: [{ t: 'Снег.', b: false, i: true }] }]);
  assert.equal(blocksText(b), 'Он вернулся.\nСнег.');
  assert.equal(contentEnd(content), 22);
});

test('редактор: запросы сохранения — заменить вкладку и расставить стили', () => {
  const b = contentToBlocks(content);
  const r = saveRequests(b, 't2', 22);
  assert.deepEqual(r[0], { deleteContentRange: { range: { startIndex: 1, endIndex: 21, tabId: 't2' } } });
  assert.deepEqual(r[1], { insertText: { location: { index: 1, tabId: 't2' }, text: 'Он вернулся.\nСнег.' } });
  // «вернулся» — с 4 по 12, «Снег.» — с 14 по 19
  assert.deepEqual(r[3].updateTextStyle.range, { startIndex: 4, endIndex: 12, tabId: 't2' });
  assert.deepEqual(r[4].updateTextStyle, { range: { startIndex: 14, endIndex: 19, tabId: 't2' }, textStyle: { italic: true }, fields: 'italic' });
  // пустая вкладка: удалять нечего
  assert.equal(saveRequests([{ runs: [{ t: 'Текст', b: false, i: false }] }], 't1', 2)[0].insertText.text, 'Текст');
});
