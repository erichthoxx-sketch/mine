import { test } from 'node:test';
import assert from 'node:assert/strict';
import { promoReminderDate, promoLinkTasks, isLitnetLink, promoToken } from '../writer/js/promolinks.js';
import { todoistTasks, todoistPlan } from '../writer/js/todoist.js';
import { promoLinksInline, promoLinksPanel } from '../writer/js/views/promolinks.js';

const alpine = 'bk_alpine';
const widow = 'bk_widow';
const entries = [
  { id: 'u1', bookId: alpine, campaign: 'Альпийский развод · таргетолог', url: 'https://litnet.com/ref/avdjDacd1gyIb-cN', expires: '2026-11-18', readers: 96, status: 'active' },
  { id: 'u2', bookId: widow, campaign: 'Черная вдова', url: 'https://litnet.com/ref/other', expires: '2026-11-21', readers: 3, status: 'active' },
];
const ctx = { today: '2026-11-01', data: { w_promolinks: entries }, wbooksById: {
  [alpine]: { id: alpine, title: 'Альпийский развод. Он оставил меня умирать' },
  [widow]: { id: widow, title: 'Развод для черной вдовы' },
} };
test('Рекламные ссылки остаются внутри соответствующей книги', () => {
  const al = promoLinksInline(ctx, alpine);
  const wd = promoLinksInline(ctx, widow);
  assert.match(al, /Альпийский развод/);
  assert.match(al, /UTM · 1/);
  assert.match(al, /18\.11\.2026/);
  assert.doesNotMatch(al, /avdjDacd1gyIb-cN/); // длинная ссылка только в деталях
  assert.doesNotMatch(al, /Черная вдова/);
  assert.match(wd, /Черная вдова/);
  assert.doesNotMatch(wd, /Альпийский развод/);
  assert.match(promoLinksPanel(ctx, { bookId: alpine, compact: true }), /avdjDacd1gyIb-cN/);
  assert.doesNotMatch(promoLinksPanel(ctx, { bookId: alpine }), /Черная вдова/);
  assert.match(promoLinksInline({...ctx,data:{w_promolinks:[]}},alpine), /\+ UTM/);
});
test('Ссылку безопасно отображаем, и счетчик UTM берем из ее пути', () => {
  assert.equal(promoToken(entries[0].url), 'avdjDacd1gyIb-cN');
  assert.equal(isLitnetLink('https://litnet.com/ref/test'), true);
  assert.equal(isLitnetLink('https://evil.net/ref/test'), false);
});
test('Напоминание: 18 ноября ср -> 17 ноября вт; вторник -> четверг', () => {
  assert.equal(promoReminderDate('2026-11-18'), '2026-11-17');
  assert.equal(promoReminderDate('2026-11-17'), '2026-11-12');
});
test('Суббота и воскресенье: напоминания в четверг и пятницу', () => {
  assert.equal(promoReminderDate('2026-11-21'), '2026-11-19');
  assert.equal(promoReminderDate('2026-11-22'), '2026-11-20');
  // Выходные события и автовыкладки живут в своих датах, не создавая «посмотри дела в четверг».
  const tasks = todoistTasks([
    { kind: 'wait', title: 'Глава выйдет сама', date: '2026-11-21' },
    { kind: 'weekend', title: 'Посмотреть дела на субботу', date: '2026-11-19' },
    { kind: 'pub', title: 'Выложить главу', date: '2026-11-21', book: alpine },
    { kind: 'utm', title: 'Обновить UTM', date: '2026-11-19', dueRaw: '2026-11-19', id: 'u2', expires: '2026-11-21', book: widow },
  ], ctx.wbooksById);
  assert.equal(tasks.length, 2);
  assert.equal(tasks.find(x => x.item.kind === 'pub').date, '2026-11-21');
  assert.equal(tasks.find(x => x.item.kind === 'utm').date, '2026-11-19');
  assert.equal(tasks.some(x => /Посмотреть дела/.test(x.content)), false);
});
test('Задача на обновление UTM всегда содержит название книги и кампании', () => {
  const links = entries.map(x => ({ ...x, book: ctx.wbooksById[x.bookId].title }));
  const due = promoLinkTasks(links, '2026-11-01');
  assert.equal(due.length, 2);
  assert.equal(due[0].due, '2026-11-17');
  assert.match(due[0].title, /Альпийский развод/);
  assert.match(due[0].title, /таргетолог/);
  assert.equal(due[0].bookId, alpine);
});

test('Старые автоматические «посмотреть дела на выходные» закрываются при синхронизации', () => {
  const old = { key:'weekend_abc123', id:'auto444', date:'2026-10-22' };
  const active=[{id:old.id,content:'Посмотреть дела на воскресенье (1)',due:{date:old.date},description:'Срок заявки на показы'}];
  const ops=todoistPlan([],{[old.key]:{id:old.id,date:old.date}},{},active,{[old.id]:old.date});
  assert.ok(ops.close.some(x => x.id === old.id));
  // Календарное воскресное дело осталось независимым от бывшей агрегатной задачи.
  const sunday=todoistTasks([{kind:'queue',date:'2026-10-25',title:'Срок заявки на показы',id:'q1'}],{});
  assert.equal(sunday.length,1);
  assert.equal(sunday[0].date,'2026-10-25');
});
