import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {todoistTasks} from '../writer/js/todoist.js';
import { linkPage, linkTodos, addLinkedTask } from '../writer/js/views/links.js';

const read = p => readFileSync(new URL(p,import.meta.url),'utf8');

test('У таргетолога один рабочий блок вместо отдельных запросов, напоминаний и истории',()=>{
  const s=read('../writer/js/views/links.js');
  const page=s.slice(s.indexOf('export function linkPage'),s.indexOf('// ---------- добавить / изменить ----------'));
  assert.match(page,/x\.kind === 'target' \? targetWorkPanel\(c,x\) :/);
  assert.match(s,/data-form="target.entry"/);
  assert.match(s,/name="entryType"/);
  assert.match(s,/name="date"/);
  assert.match(s,/name="section"/);
  assert.match(s,/data-act="target.logToTask"/);
  assert.match(s,/name="detail"/);
});
test('Планер позволяет выбрать таргетолога при создании дела и получить ту же запись контакта',()=>{
  const plan=read('../writer/js/views/plan.js');
  assert.match(plan,/name="contact"/);
  assert.match(plan,/await addLinkedTask\(contact\.id/);
  assert.match(plan,/for \(const x of linkTodos\(c\)\)/);
  assert.match(plan,/data-act="link\.todoDone"/);
});
test('Todoist получает дату, папку и полный текст сообщения без создания финансовых записей',()=>{
  const t={ kind:'waitans', title:'Написать таргетологам', description:'Добрый день! Пришлите отчет.',
    date:'2026-10-28', section:'Деньги и реклама',linkId:'contact-1',todoK:'task-1',sub:'Агентство'};
  const task=todoistTasks([t],{})[0];
  assert.equal(task.project,'Мастерская');
  assert.equal(task.section,'Деньги и реклама');
  assert.equal(task.date,'2026-10-28');
  assert.equal(task.description,'Добрый день! Пришлите отчет.');
  assert.equal(task.item,t);
});
test('Задача с книгой отправляется в раздел книги и не дублируется',()=>{
  const t={kind:'waitans',title:'Согласовать рекламу', date:'2026-10-28',bookId:'book-1',
    linkId:'contact-1',todoK:'task-2',section:'Деньги и реклама'};
  const books={'book-1':{title:'Альпийский развод. Он оставил меня умирать'}};
  const tasks=todoistTasks([t,t],books);
  assert.equal(tasks.length,1);
  assert.equal(tasks[0].project,'Книги');
  assert.equal(tasks[0].section,'Альпийский развод');
});
test('Изменение коммуникаций не записывает деньги и не требует отдельной коллекции',()=>{
  const s=read('../writer/js/views/links.js');
  const src=s.slice(s.indexOf('export async function addLinkedTask'),s.indexOf('// напоминания по связи'));
  assert.match(src,/store\.patch\('w_links', contactId/);
  assert.match(src,/scheduleTodoist\?\.\(\)/);
  assert.doesNotMatch(src,/store\.(?:put|patch)\('(sales|reports|campaigns|months|adnotes)'/);
  assert.match(src,/\^\\d\{4\}-\\d\{2\}-\\d\{2\}\$/);
});

test('Реальный рендер карточки таргетолога показывает единую ленту и позволяет создать дело',async()=>{
  const target={id:'t1',kind:'target',name:'Рекламное агентство',bookIds:[],
    log:[{k:'log1',date:'2026-10-28',kind:'note',text:'Текст будущего письма'}],todos:[]};
  const data={w_links:[target],w_waiting:[]};
  const c={today:'2026-10-26',data,wbooks:[],wbooksById:{},settings:{}};
  let scheduled=0;
  globalThis.window={__app:{ctx:()=>c,store:{patch:async(coll,id,fields)=>{
    assert.equal(coll,'w_links');assert.equal(id,'t1');Object.assign(target,fields);
  }},scheduleTodoist:()=>{scheduled++}}};
  let html=linkPage({ctx:()=>c},'t1').html;
  assert.match(html,/Общение и дела/);
  assert.match(html,/Текст будущего письма/);
  assert.match(html,/В Планер/);
  assert.doesNotMatch(html,/<h2>Напоминания/);
  assert.doesNotMatch(html,/<h2>Запросы/);
  const task=await addLinkedTask('t1',{date:'2026-10-28',text:'Написать таргетологам',
    detail:'Запросить отчет по рекламе',section:'Деньги и реклама'});
  assert.equal(scheduled,1);
  assert.equal(linkTodos(c).length,1);
  assert.equal(linkTodos(c)[0].date,'2026-10-28');
  assert.equal(linkTodos(c)[0].k,task.k);
  html=linkPage({ctx:()=>c},'t1').html;
  assert.match(html,/Написать таргетологам/);
  assert.match(html,/Запросить отчет по рекламе/);
  delete globalThis.window;
});
