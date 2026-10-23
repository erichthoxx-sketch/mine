import { test } from 'node:test';
import assert from 'node:assert/strict';
import { plural } from '../js/format.js';
import { promoChannel, promoChannelName, promoLinkTasks, promoReminderDate } from '../writer/js/promolinks.js';
import { litnetSummary, litnetView } from '../direct/js/views/litnet.js';
import { socialView } from '../writer/js/views/social.js';
import { readyForCampaign } from '../direct/js/litnetcalc.js';

const book = { id:'book_1', title:'Альпийский развод' };
const directLink = { id:'ad1', bookId:book.id, campaign:'Кампания таргетолога', channel:'direct', url:'https://litnet.com/ref/direct1', expires:'2026-11-18', status:'active', readers:12 };
const socialLink = { id:'threads1', bookId:book.id, campaign:'Threads · шапка профиля', channel:'social', url:'https://litnet.com/ref/social1', expires:'2026-11-22', status:'active', readers:4 };
const oldThreads = { ...socialLink, id:'oldThreads', channel:undefined, campaign:'Threads — шапка профиля' };
const dirApp = rows => ({
  ctx:()=>({today:'2026-10-23',data:{w_promolinks:rows,w_books:[book]},settings:{}}),
  snap:()=>({campaigns:[]}),
});
const socialApp = rows => ({
  ctx:()=>({today:'2026-10-23',data:{w_promolinks:rows},wbooks:[book],wbooksById:{[book.id]:book}}),
});
test('Russian links declension: 1, 3, 5, 11, 21, 23, 25, 101', () => {
  for (const [count, word] of [[0,'ссылок'],[1,'ссылка'],[3,'ссылки'],[5,'ссылок'],[11,'ссылок'],[14,'ссылок'],[21,'ссылка'],[23,'ссылки'],[25,'ссылок'],[101,'ссылка']])
    assert.equal(plural(count,['ссылка','ссылки','ссылок']),word);
  const rows = [directLink,socialLink,oldThreads];
  assert.match(litnetSummary(dirApp(rows)), /3 ссылки/);
  assert.match(litnetSummary(dirApp(Array.from({length:23},(_,i)=>({...socialLink,id:String(i)})))),/23 ссылки/);
});
test('Links are classified Direct / Social; old explicit Threads inferred as Social', () => {
  assert.equal(promoChannel(directLink),'direct');
  assert.equal(promoChannel(socialLink),'social');
  assert.equal(promoChannel(oldThreads),'social');
  assert.equal(promoChannelName(oldThreads),'Соцсети');
  assert.equal(promoChannel({campaign:'Проект без указания сети'}),'direct');
});
test('Planner schedules the same links into their channel, preserves book in task title', () => {
  const tasks=promoLinkTasks([{...directLink,book:book.title},{...socialLink,book:book.title}], '2026-10-23');
  const direct=tasks.find(x=>x.id==='ad1'),social=tasks.find(x=>x.id==='threads1');
  assert.equal(direct.to,'/marketing');
  assert.match(direct.title,/Директ: обновить ссылку — «Альпийский развод»/);
  assert.equal(direct.due,'2026-11-17');
  assert.equal(social.to,'/social');
  assert.match(social.title,/Соцсети · Threads/);
  assert.match(social.title,/Альпийский развод/);
  assert.equal(social.due,'2026-11-20'); // Sunday -> Friday
  assert.equal(promoReminderDate('2026-11-17'),'2026-11-12');
});
test('Social links show in Social section, not in Direct campaign selection', () => {
  const c=socialApp([directLink,socialLink]);
  const s=socialView(c).html;
  assert.match(s,/Соцсети/);
  assert.match(s,/Threads/);
  assert.doesNotMatch(s,/Кампания таргетолога/);
  assert.equal(readyForCampaign({...socialLink,bookTitle:book.title},'2026-11-10',book.title),false);
  assert.equal(readyForCampaign({...directLink,bookTitle:book.title},'2026-11-10',book.title),true);
  const html=litnetView(dirApp([directLink,socialLink])).html;
  assert.match(html,/Директ · Кампания таргетолога/);
  assert.match(html,/Соцсети · Threads/);
});
