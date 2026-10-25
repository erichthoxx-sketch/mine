import test from 'node:test';
import assert from 'node:assert/strict';
import {cleanContestText, contestHasDiscussion, parseContest} from '../writer/js/wcalc.js';

test('Конкурс Litnet: комментарии и дубли отзывов не попадают в условия',()=>{
  const original=[
    'Title: Литературный конкурс: Темное притяжение',
    'URL Source: https://litnet.com/ru/contests/temnoe-prityazhenie-c154/rules',
    'Markdown Content:', 'Темное притяжение',
    'Срок приема работ', '19 окт. 2026 - 31 янв. 2027',
    'Размер книги', 'От 30 000 знаков',
    'Условия участия:', 'Принимаются только новые романы',
    'Комментарии (15)', 'Авторизуйтесь, чтобы оставлять комментарии',
    'M* W*','15.10.2026 17:23',
    'Можно ли предложить роман в японском школьном сеттинге?',
    'Можно ли предложить роман в японском школьном сеттинге?',
    'Все ответы',
    'Тамара Вуд','15.10.2026 07:34',
    'Прошу вас дать ответ на мой комментарий. Спасибо!',
    'Кристина Щербинская',
    '12.10.2026 19:04', 'Могу опробоваться?'
  ].join('\n');
  assert.equal(contestHasDiscussion(original),true);
  const cleaned=cleanContestText(original);
  assert.match(cleaned,/Темное притяжение/);
  assert.match(cleaned,/31 янв. 2027/);
  assert.match(cleaned,/Принимаются только новые романы/);
  assert.doesNotMatch(cleaned,/Комментарии|Авторизуйтесь|Тамара Вуд|Кристина|Все ответы|Прошу вас|сеттинге/i);
  const parsed=parseContest(cleaned,'https://litnet.com/ru/contests/temnoe-prityazhenie-c154/rules','2026-10-25');
  assert.equal(parsed.end,'2027-01-31');
  assert.equal(parsed.name,'Темное притяжение');
});
test('Очищаем и старые сохраненные описания',()=>{
  const old=['Темное притяжение','Срок приема работ','19 окт. 2026 - 31 янв. 2027','Принимаются только новые произведения','Обсуждение','Авторизуйтесь, чтобы оставлять комментарии','Пользователь','15.10.2026 17:23','Вопрос к организаторам'].join('\n');
  const cleaned=cleanContestText(old);
  assert.ok(!cleaned.includes('Пользователь'));
  assert.ok(!cleaned.includes('Вопрос к организаторам'));
  assert.match(cleaned,/Принимаются только новые/);
});
test('Слово комментарии внутри законной фразы не обрезает правила',()=>{
  const text='Темное притяжение\nСрок приема работ\n19 окт. 2026 - 31 янв. 2027\nКомментарии к условиям можно отправить организатору до 20 января.\nНе менее 30 000 знаков';
  assert.match(cleanContestText(text),/Не менее 30 000 знаков/);
});
