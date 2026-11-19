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
