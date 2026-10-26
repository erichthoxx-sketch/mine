import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { linkedTargetologists, targetReminders } from '../js/target-partners.js';

const read = p => readFileSync(new URL(p,import.meta.url),'utf8');
const contacts = [
  {id:'t1',kind:'target',name:'Агентство А',partnerStatus:'active',showDirect:true,showIncome:false,
    todos:[{k:'1',text:'Отчет по рекламе',date:'2026-11-02',done:false},
           {k:'2',text:'Прошлая задача',date:'2026-10-20',done:true}]},
  {id:'t2',kind:'target',name:'Агентство Б',partnerStatus:'paused',showDirect:false,showIncome:true},
  {id:'l1',kind:'publisher',name:'Издательство',showDirect:true,showIncome:true},
];

test('Директ получает только явно включенных внешних таргетологов',()=>{
  assert.deepEqual(linkedTargetologists({w_links:contacts},'direct').map(x=>x.id),['t1']);
});
test('Доходы получают только отдельно включенных таргетологов',()=>{
  assert.deepEqual(linkedTargetologists({w_links:contacts},'income').map(x=>x.id),['t2']);
});
test('Планер и Директ используют только незавершенные дела контакта',()=>{
  assert.deepEqual(targetReminders(contacts[0],'2026-10-26').map(x=>x.k),['1']);
  assert.equal(targetReminders(contacts[0],'2026-11-04')[0].overdue,true);
});
test('Связи позволяют выбрать тип, привязать книги, общение, сроки и отдельные приложения',()=>{
  const s=read('../writer/js/views/links.js');
  for (const part of [
    "target: 'Таргетологи'", 'name="bookIds"', 'name="showDirect"', 'name="showIncome"',
    'data-form="link.log"', 'name="logKind"', "acts['link.todo']", 'data-act="link.todoDone"',
    "changes['link.kind']",
  ]) assert.ok(s.includes(part), part);
  assert.match(s,/app\(\)\.store\.patch\('w_links', x\.id/);
  assert.match(s,/function linkForm\(x = \{\}\)/);
});
test('Контактные задачи уже синхронизируются в Планер без отдельного дублирования',()=>{
  const s=read('../writer/js/views/plan.js');
  assert.match(s,/for \(const x of linkTodos\(c\)\)/);
  assert.match(s,/to: '\/link\/' \+ x\.linkId/);
});
test('Доходы и Директ читают одну коллекцию, не создают расходы из переписки',()=>{
  const inc=read('../js/app.js'), direct=read('../direct/js/app.js');
  const ads=read('../js/views/ads.js'), dh=read('../direct/js/views/home.js');
  assert.match(inc,/'sales_history', 'w_links'/);
  assert.match(direct,/'w_books', 'w_links'/);
  assert.match(ads,/linkedTargetologists\(c\.data, 'income'\)/);
  assert.match(dh,/linkedTargetologists\(c\.data,'direct'\)/);
  assert.doesNotMatch(ads.slice(ads.indexOf('function externalTargetSection'),ads.indexOf('export function ads')),/store\.put|store\.patch|campaigns\.push|reports\.push/);
  assert.doesNotMatch(dh.slice(dh.indexOf('function partnerPanel'),dh.indexOf('function connectCard')),/store\.put|store\.patch|d\.apply/);
});
