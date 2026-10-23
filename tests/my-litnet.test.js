import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exactTag, visibleLinks, linkStatus, readyForCampaign, bookMatches, expiresFromCreated } from '../direct/js/litnetcalc.js';
import { campaignPayload, CREATOR_DEFAULT } from '../direct/js/creator.js';
import { promoLinkTasks } from '../writer/js/promolinks.js';

const link={id:'utm_A',bookId:'bookA',campaign:'Альпийский развод · реклама',url:'https://litnet.com/ref/avdjDacd1gyIb-cN',expires:'2026-11-18',status:'active',readers:96};
const books=[{id:'bookA',title:'Альпийский развод. Он оставил меня умирать'}];

test('Персональная ссылка дает точные параметры URL, не содержит адрес /ref',()=>{
  assert.equal(exactTag(link.url),'utm_litref=avdjDacd1gyIb-cN');
  assert.equal(exactTag('https://evil.example/ref/key'),'');
  assert.equal(exactTag('https://litnet.com/ru/book/example'),'');
});
test('Общий список Мастерской и Директа связывается с названием книги и не показывает архив',()=>{
  const links=visibleLinks([link,{...link,id:'archived',status:'archived'}],books,{today:'2026-10-23'});
  assert.equal(links.length,1);
  assert.equal(links[0].bookTitle,'Альпийский развод. Он оставил меня умирать');
  assert.equal(links[0].tag,'utm_litref=avdjDacd1gyIb-cN');
  assert.equal(links[0].state.type,'active');
});
test('Истечение: ссылка остается работающей, но больше не делает новых привязок',()=>{
  const expired=linkStatus(link,'2026-11-19');
  assert.equal(expired.type,'expired');
  assert.match(expired.label,/Новые привязки/);
  assert.equal(linkStatus(link,'2026-11-17').renew,'2026-11-17');
  assert.equal(expiresFromCreated('2026-10-20'),'2026-11-18');
});
test('Будничное предупреждение остается в общем планере с точной книгой',()=>{
  const t=promoLinkTasks([{...link,book:books[0].title}],'2026-10-23');
  assert.equal(t[0].due,'2026-11-17');
  assert.match(t[0].title,/Альпийский развод/);
});
test('Кампании для разных книг нельзя путать; выбранная ссылка должна жить при старте',()=>{
  const decorated={...link,bookTitle:books[0].title};
  assert.equal(readyForCampaign(decorated,'2026-11-18',books[0].title),true);
  assert.equal(readyForCampaign(decorated,'2026-11-19',books[0].title),false);
  assert.equal(readyForCampaign(decorated,'2026-11-14','Развод для черной вдовы'),false);
  assert.equal(bookMatches('Развод для черной вдовы','Развод для чёрной вдовы'),true);
});
test('Новая ЕПК получает метку только в TrackingParams кампании, а не в каждом объявлении',()=>{
  const c={...CREATOR_DEFAULT,name:'Альпийский тест',start:'2026-11-10',end:'2026-11-20'};
  const p=campaignPayload(c,{trackingParams:exactTag(link.url),counterId:108714441});
  assert.equal(p.Campaigns[0].UnifiedCampaign.TrackingParams,'utm_litref=avdjDacd1gyIb-cN');
  assert.equal(campaignPayload(c).Campaigns[0].UnifiedCampaign.TrackingParams,undefined);
});
