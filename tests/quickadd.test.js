import test from 'node:test';
import assert from 'node:assert/strict';
import { parseQuick } from '../writer/js/quickadd.js';

test('быстрое дело: дата из слов в начале или конце', () => {
  const T = '2026-11-14'; // суббота
  assert.deepEqual(parseQuick('написать таргетологу завтра', T), { text: 'написать таргетологу', date: '2026-11-15' });
  assert.deepEqual(parseQuick('Завтра: позвонить Ане', T), { text: 'позвонить Ане', date: '2026-11-15' });
  assert.deepEqual(parseQuick('отчёт в пятницу', T), { text: 'отчёт', date: '2026-11-20' });
  assert.deepEqual(parseQuick('отчёт сб', T), { text: 'отчёт', date: '2026-11-21' });
  assert.deepEqual(parseQuick('скидка 20.11', T), { text: 'скидка', date: '2026-11-20' });
  assert.deepEqual(parseQuick('продлить домен 27 октября', T), { text: 'продлить домен', date: '2027-10-27' });
  assert.deepEqual(parseQuick('через 3 дня проверить рекламу', T), { text: 'проверить рекламу', date: '2026-11-17' });
  assert.deepEqual(parseQuick('глава 5 к среде', T).date, null); // «к среде» не трогаем — не наш формат
  assert.deepEqual(parseQuick('купить 3 мая книги', T), { text: 'купить 3 мая книги', date: null }); // дата в середине — не трогаем
  assert.deepEqual(parseQuick('Майский конкурс', T).date, null);
});
