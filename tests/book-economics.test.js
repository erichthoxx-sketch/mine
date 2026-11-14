import test from 'node:test';
import assert from 'node:assert/strict';
import { LOG_FIELDS, landingBookId, buildCohortData, cohortSummary } from '../js/cohorts.js';
import { campaignBookEconomics } from '../direct/js/bookeconomics.js';

test('Логи Метрики: выгружаем страницу входа и сохраняем только ID книги, а не ссылку с UTM', () => {
  assert.ok(LOG_FIELDS.includes('ym:s:startURL'));
  assert.equal(landingBookId('https://litnet.com/ru/reader/razvod-dlya-chernoi-vdovy-b639097?utm_source=yandex&secret=abc'), '639097');
  assert.equal(landingBookId('https://litnet.com/ru/book/razvod-dlya-chernoi-vdovy-b639097'), '639097');
  assert.equal(landingBookId('https://example.org/ru/book/x-b639097'), null);
  const head = ['ym:s:clientID','ym:s:dateTime','ym:s:<attribution>TrafficSource','ym:s:<attribution>AdvEngine',
    'ym:s:<attribution>DirectClickOrder','ym:s:goalsID','ym:s:goalsDateTime','ym:s:startURL'].join('\t');
  const row = ['PERSON_1','2026-11-01 10:00:00','ad','yandex','715','[215,220]',
    "['2026-11-01 11:00:00','2026-11-03 11:00:00']",
    'https://litnet.com/ru/book/razvod-dlya-chernoi-vdovy-b639097?utm_source=secret'].join('\t');
  const data = buildCohortData([head+'\n'+row], {from:'2026-10-01',to:'2026-11-10',
    goals:[{id:215,name:'Добавление в библиотеку'}, {id:220,name:'Покупка книги'}]});
  assert.equal(data.people.length, 1);
  assert.equal(data.people[0][8], '639097');
  assert.equal(data.people[0][9], 2);
  assert.equal(JSON.stringify(data).includes('utm_source'), false);
  assert.equal(JSON.stringify(data).includes('PERSON_1'), false);
});

test('Когорты: библиотека -> ПОСЛЕДУЮЩАЯ покупка; только наблюдавшиеся все окно', () => {
  const sources=[{t:'ad', e:'ya_direct', d:'715'}], people=[];
  for(let i=0;i<25;i++) people.push([0,0,0,1,null,i<7?3:null,0,null,'639097',i<7?3:null]);
  for(let i=0;i<9;i++) people.push([37,0,0,1,null, i<5?2:null,0,null,'639097',i<5?2:null]);
  // покупка ДО добавления не должна считаться покупкой после добавления
  people.push([0,0,0,10,null,2,0,null,'639097',null]);
  const s=cohortSummary({from:'2026-10-01',to:'2026-11-09',sources,people},'2026-11-10');
  const g=s.campBooks['715']['639097'];
  assert.equal(g.lib,35);
  assert.equal(g.libToBuy[7].eligible, 26);
  assert.equal(g.libToBuy[7].buyers, 7);
  assert.equal(g.libToBuy[7].rate, 7/26);
  assert.equal(s.camps['715'].libToBuy[30].eligible,26); // покупка до добавления не в числителе
  assert.match(s.note,/любой книги/);
});

const inputs=()=>({
  campaigns:[{id:715,name:'Вдова',state:'ON',start:'2026-11-10'}],
  ads:[{cid:715,href:'https://litnet.com/ru/book/razvod-dlya-chernoi-vdovy-b639097'}],
  books:[{id:'w2',title:'Развод для черной вдовы',litnetUrl:'https://litnet.com/ru/book/razvod-dlya-chernoi-vdovy-b639097'}],
  sales:[{date:'2026-11-14',book:'Развод для черной вдовы (подписка)',qty:2,royalty:180},
    {date:'2026-11-14',book:'Другая книга',qty:5,royalty:500}],
  daily:[{date:'2026-11-13',cid:715,cost:200,clicks:40},{date:'2026-11-14',cid:715,cost:100,clicks:20}],
  conv:[{date:'2026-11-13',cid:715,conv:{215:10,220:1}}],
  stats:{mAt:'2026-11-14T14:00:00Z'},
  metrika:{goals:[{id:215,name:'Добавление в библиотеку'}, {id:220,name:'Покупка книги'}]},
  cohorts:{at:'2026-11-14T15:00:00Z',from:'2026-08-15',to:'2026-11-13',
    camps:{715:{n:50,lib:20,buy:3}}, campBooks:{715:{639097:{n:30,lib:15,buy:2,libToBuy:{7:{eligible:20,buyers:2,rate:0.1}}}}}},
  today:'2026-11-14'
});
test('Экономика: расходы от кампании, роялти только целевой книги, когорты по книге входа', () => {
  const [r]=campaignBookEconomics(inputs());
  assert.equal(r.bookTitle,'Развод для черной вдовы');
  assert.equal(r.spend30,300);
  assert.equal(r.royaltiesAllChannels30,180);
  assert.equal(r.salesAllChannels30,2);
  assert.equal(r.royaltyPerBookSale,90);
  assert.equal(r.breakevenBuys,4);
  assert.equal(r.libraries7,10);
  assert.equal(r.costPerLibrary7,30);
  assert.equal(r.cohort.landingVerified,true);
  assert.equal(r.cohort.landingBook.buy,2);
  assert.equal(r.attributedBookRoyalty,null); // НЕЛЬЗЯ выдавать покупки других книг за продажи Вдовы
  assert.equal(r.attributedBookROI,null);
});

test('Неизвестные конверсии, несколько рекламируемых книг или нет продаж — никаких выдуманных ROI', () => {
  const broken=inputs(); broken.stats={mAt:'2026-11-01T14:00:00Z'};
  const [a]=campaignBookEconomics(broken);
  assert.equal(a.conversionAvailable,false); assert.equal(a.libraries30,null);
  const mixed=inputs();
  mixed.ads.push({cid:715,href:'https://litnet.com/ru/book/drugaya-kniga-b999999'});
  const [b]=campaignBookEconomics(mixed);
  assert.equal(b.association,'mixed');
  assert.equal(b.royaltiesAllChannels30,null);
  assert.equal(b.attributedBookROI,null);
  const fresh=inputs(); fresh.sales=[];
  const [c]=campaignBookEconomics(fresh);
  assert.equal(c.breakevenBuys,null); assert.equal(c.attributedBookRoyalty,null);
});
