import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  noteTitle, notePreview, notesView, noteTags, normTag, textStats, toggleCheck, noteHtml, fromSimplenoteJson, newOnly,
  fillPrompt, missingVars, promptsFor, docPromptTabs, guessPlace, expiredNote,
} from '../writer/js/notecalc.js';

test('заметка: название — первая строка, превью — дальше; поиск, теги, закреп сверху, корзина отдельно', () => {
  const n = { text: '# Сцены\n- [ ] проверить даты\nМарта в красном' };
  assert.equal(noteTitle(n), 'Сцены'); assert.equal(notePreview(n), 'проверить даты Марта в красном');
  assert.equal(noteTitle({ text: '  \n' }), 'Новая заметка');
  const list = [
    { id: 'a', text: 'Старое', tags: ['вдова'], updatedAt: '2026-11-01' },
    { id: 'b', text: 'Новое про медведя', tags: [], updatedAt: '2026-11-10' },
    { id: 'c', text: 'Закреплённое', tags: ['вдова'], pinned: true, updatedAt: '2026-10-01' },
    { id: 'd', text: 'В корзине', tags: ['вдова'], deletedAt: '2026-11-11' },
  ];
  assert.deepEqual(notesView(list).map((x) => x.id), ['c', 'b', 'a']);
  assert.deepEqual(notesView(list, { tag: 'вдова' }).map((x) => x.id), ['c', 'a']);
  assert.deepEqual(notesView(list, { tag: '@trash' }).map((x) => x.id), ['d']);
  assert.deepEqual(notesView(list, { q: 'медвед' }).map((x) => x.id), ['b']);
  assert.deepEqual(noteTags(list), [{ tag: 'вдова', n: 2 }]);
  assert.equal(normTag('#Черная Вдова'), 'черная-вдова');
  assert.deepEqual(textStats('Два слова\nи ещё'), { words: 4, chars: 14 });
  assert.equal(expiredNote({ deletedAt: '2026-10-01T00:00:00Z' }, Date.parse('2026-11-19T00:00:00Z')), true);
});

test('чек-лист: галочка ставится и снимается, в просмотре — кнопки с номером строки', () => {
  const t = 'Дела\n- [ ] одно\n- [x] другое';
  assert.equal(toggleCheck(t, 1), 'Дела\n- [x] одно\n- [x] другое');
  assert.equal(toggleCheck(t, 2), 'Дела\n- [ ] одно\n- [ ] другое');
  assert.equal(toggleCheck(t, 0), t);
  const h = noteHtml(t + '\n**жирно** и <тег>');
  assert.match(h, /data-l="1"/); assert.match(h, /<li class="on">/); assert.match(h, /<b>жирно<\/b> и &lt;тег&gt;/);
});

test('перенос из Simplenote: notes.json с тегами, закрепом и корзиной; второй раз не дублируется', () => {
  const got = fromSimplenoteJson({ activeNotes: [{ id: 'x1', content: 'Текст', tags: ['Идеи'], pinned: true, creationDate: '2026-01-01T00:00:00Z', lastModified: '2026-02-01T00:00:00Z' }, { id: 'x2', content: '  ' }], trashedNotes: [{ id: 'x3', content: 'Старое' }] });
  assert.equal(got.length, 2);
  assert.deepEqual([got[0].sid, got[0].tags, got[0].pinned, got[0].updatedAt], ['x1', ['идеи'], true, '2026-02-01T00:00:00.000Z']);
  assert.ok(got[1].deletedAt);
  assert.deepEqual(newOnly(got, [{ sid: 'x1' }]).map((n) => n.sid), ['x3']);
});

test('промты: подстановка переменных, место и книга, вкладки «Промт» из Документов', () => {
  assert.equal(fillPrompt('Книга {книга}, глава {Глава}: {неизвестно}', { книга: 'Вдова', глава: 'Глава 3' }), 'Книга Вдова, глава Глава 3: {неизвестно}');
  assert.deepEqual(missingVars('{текст главы} и {книга} и {что-то}'), ['текст главы', 'книга']);
  const list = [
    { id: 1, place: 'chapter', uses: 1 }, { id: 2, place: 'any', uses: 5 }, { id: 3, place: 'idea' },
    { id: 4, place: 'chapter', bookId: 'b2' }, { id: 5, place: 'chapter', deletedAt: 'x' }, { id: 6, place: 'chapter', bookId: 'b1', uses: 3 },
  ];
  assert.deepEqual(promptsFor(list, 'chapter', 'b1').map((p) => p.id), [6, 1, 2]);
  const books = [{ id: 'b1', title: 'Вдова', tabs: [{ title: 'Глава 1' }, { title: 'Промт эксперементальный' }, { title: 'Prompt сцены' }] }];
  assert.deepEqual(docPromptTabs(books, [{ src: 'b1:Prompt сцены' }]).map((x) => x.tab), ['Промт эксперементальный']);
  assert.equal(guessPlace('Промт для сцен'), 'chapter'); assert.equal(guessPlace('Промт персонажи'), 'chars'); assert.equal(guessPlace('Промт'), 'any');
});

import { toSimplenoteJson, changedHere } from '../writer/js/notecalc.js';
test('экспорт в Simplenote: их формат notes.json, теги без пробелов, закреп и markdown; туда-обратно без потерь; «новые и изменённые»', () => {
  const list = [
    { id: 'n1', text: '# Сцены\n- [ ] свадьба', tags: ['черная вдова'], pinned: true, createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-02T10:00:00.000Z' },
    { id: 'n2', sid: 'abc', text: 'Из Simplenote', tags: [], createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-02T00:00:00.000Z', impAt: '2026-11-10T00:00:00.000Z' },
    { id: 'n3', text: 'В корзине', deletedAt: '2026-11-03' }, { id: 'n4', text: '   ' },
  ];
  const J = toSimplenoteJson(list);
  assert.deepEqual(J.trashedNotes, []);
  assert.equal(J.activeNotes.length, 2);
  assert.deepEqual(J.activeNotes[0], { id: 'n1', content: '# Сцены\n- [ ] свадьба', creationDate: '2026-11-01T10:00:00.000Z', lastModified: '2026-11-02T10:00:00.000Z', tags: ['черная-вдова'], pinned: true, markdown: true });
  assert.equal(J.activeNotes[1].id, 'abc');
  const back = fromSimplenoteJson(JSON.stringify(J));
  assert.deepEqual(back.map((n) => [n.text, n.pinned, n.updatedAt]), [['# Сцены\n- [ ] свадьба', true, '2026-11-02T10:00:00.000Z'], ['Из Simplenote', false, '2026-01-02T00:00:00.000Z']]);
  // новые и изменённые: созданная здесь — да; перенесённая и не тронутая — нет; тронутая после переноса — да; после экспорта — только свежее
  assert.deepEqual(list.filter((n) => changedHere(n)).map((n) => n.id), ['n1']);
  assert.equal(changedHere({ ...list[1], updatedAt: '2026-11-15T00:00:00.000Z' }), true);
  assert.equal(changedHere(list[0], '2026-11-05T00:00:00.000Z'), false); // уже выгружена — второй раз не попадёт
  assert.equal(changedHere({ ...list[0], updatedAt: '2026-11-06T00:00:00.000Z' }, '2026-11-05T00:00:00.000Z'), true);
});

import { needsWsTag, WS_TAG } from '../writer/js/notecalc.js';
test('тег «мастерская»: только созданным здесь, без корзины, перенесённых и уже помеченных', () => {
  const L = [{ id: 1, text: 'а' }, { id: 2, sid: 'sn', text: 'б' }, { id: 3, sid: 'txt:x', text: 'в' }, { id: 4, text: 'г', deletedAt: 'x' }, { id: 5, text: 'д', tags: [WS_TAG] }, { id: 6, text: 'е', tags: ['идеи'] }];
  assert.deepEqual(needsWsTag(L).map((n) => n.id), [1, 6]);
});
