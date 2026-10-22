import test from 'node:test';
import assert from 'node:assert/strict';
import { parseReviewBatch, uniqueReviews, reviewKey, newReviews, reviewsPrompt } from '../writer/js/reviews.js';

test('можно добавить несколько отзывов одной вставкой', () => {
  const rows = parseReviewBatch('Первый отзыв\n---\nВторой отзыв', 'Литнет');
  assert.equal(rows.length, 2);
  assert.equal(rows[0].source, 'Литнет');
  assert.equal(rows[1].text, 'Второй отзыв');
});
test('пустые и повторяющиеся отзывы не размножаются', () => {
  const bookId = 'book-one';
  const candidates = parseReviewBatch('Понравился роман\n---\nПонравился   роман\n---\nДругой');
  const existing = [{ bookId, source: 'Литнет', text: 'ПОНРАВИЛСЯ РОМАН' }];
  const next = uniqueReviews(bookId, candidates, existing);
  assert.equal(next.length, 1);
  assert.equal(next[0].text, 'Другой');
  assert.notEqual(reviewKey({ source:'Литнет', text:'X' }), reviewKey({ source:'Литгород', text:'X' }));
});
test('можно загрузить JSON со ссылками и датами', () => {
  const rows = parseReviewBatch(JSON.stringify([
    { id: 1234, comment: 'Очень атмосферно', user_name:'Читатель', date:'2026-10-22', url:'https://litnet.com/review' },
    { text: 'Не мое', date:'вчера', url:'javascript:alert(1)' },
  ]));
  assert.equal(rows[0].sourceId, '1234');
  assert.equal(rows[0].author, 'Читатель');
  assert.equal(rows[0].date, '2026-10-22');
  assert.equal(rows[1].date, '');
  assert.equal(rows[1].url, '');
});
test('промт включает сами отзывы, а не придуманный анализ', () => {
  const rows = parseReviewBatch('Я не простила бы героя');
  const text = reviewsPrompt({ title:'Звериная тропа' }, rows, { date:'2026-10-22' });
  assert.match(text, /Я не простила бы героя/);
  assert.match(text, /негатив к поступку персонажа/);
  assert.match(text, /Число отзывов: 1/);
});
test('новые комментарии выбираются после отметки экспорта', () => {
  const xs = [
    { id:'1', addedAt:'2026-10-20T08:00:00.000Z' },
    { id:'2', addedAt:'2026-10-22T08:00:00.000Z' },
  ];
  assert.equal(newReviews(xs).length, 2);
  assert.deepEqual(newReviews(xs, '2026-10-21T10:00:00.000Z').map(x => x.id), ['2']);
});
