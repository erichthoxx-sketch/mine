// Бесплатный первый этап автоподбора конкурентов: открытые тематические коллекции Литнета.
// Не является полным поиском по каталогу, не требует Wordstat и не копирует чужую аналитику.
import {safePublicBookUrl, tokens, tropeRadar} from './competition.js';
const CATALOGS = [
  {name:'Дарк романс',url:'https://litnet.com/ru/bundle/dark-romans',keys:['дарк','dark','одерж','похищ','кримин','мафи','вдов','смерт','опасн','запрет','ритуаль']},
  {name:'Страсть и опасность',url:'https://litnet.com/ru/bundle/strast-i-opasnost',keys:['любов','опасн','спас','кримин','развод','тайн','похищ','детектив','триллер']},
  {name:'Одержимые любовью',url:'https://litnet.com/ru/bundle/litmob-oderzhimye-lyubovyu',keys:['одерж','ревност','властн','дарк','похищ','муж','притяж','предател']},
];
export function discoverySources(book={},keywords=[],topics=''){
  const source=[book.title,book.genre,book.subgenre,book.annotation,book.description,book.tropes,topics,
    ...keywords.map(x=>x.phrase||'')].filter(Boolean).join(' ').toLowerCase().replace(/ё/g,'е');
  return [...CATALOGS].map(x=>({...x,match:x.keys.reduce((n,k)=>n+(source.includes(k)?1:0),0)}))
    .sort((a,b)=>b.match-a.match).slice(0,3);
}
export function rankPublicBooks(candidates,book={},keywords=[],topics=''){
  const query=[book.title,book.genre,book.subgenre,book.annotation,book.description,book.tropes,topics,
    ...keywords.map(x=>x.phrase||'')].filter(Boolean).join(' ');
  const own=tokens(query).filter(x=>x.length>=5),short=new Set(own.map(x=>x.slice(0,5)));
  return (candidates||[]).map(c=>{
    const other=tokens([c.title,c.description].join(' '));
    const matched=[...new Set(other.filter(x=>short.has(x.slice(0,5))).map(x=>x.slice(0,5)))];
    const tropes=tropeRadar([{description:c.description}]).map(x=>x.trope);
    const hints=[...new Set((c.genreHint||[]).concat(tropes))].slice(0,4);
    return {...c,overlap:matched.length,hints,score:matched.length+(hints.length?0.25:0)};
  }).sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title,'ru'));
}
export function publicBundleCards(html,sourceName=''){
  if(typeof DOMParser==='undefined')return [];
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  doc.querySelectorAll('script,style,noscript,nav,footer').forEach(x=>x.remove());
  const results=new Map();
  for(const a of doc.querySelectorAll('a[href*="/ru/book/"], a[href*="/book/"]')){
    const href=a.getAttribute('href');
    let url;
    try{url=new URL(href,'https://litnet.com').toString();}catch{continue;}
    if(!/^https:\/\/(?:www\.)?litnet\.com\/(?:ru\/)?book\/[^?#]+/.test(url)||!safePublicBookUrl(url))continue;
    const card=a.closest('article,li,[class*="book-item"],[class*="book-card"],[class*="book-list"]')||a.parentElement;
    const heading=card?.querySelector('h3,h4,h5')?.textContent?.trim()||'';
    const title=(a.textContent||'').trim()||heading||a.querySelector('img')?.getAttribute('alt')||'';
    const cleanTitle=title.replace(/\s+/g,' ').slice(0,180);
    const description=(card?.querySelector('[class*="desc"],[class*="annotation"],[class*="anot"],p')?.textContent||'').replace(/\s+/g,' ').trim().slice(0,800);
    if(results.has(url))continue;
    results.set(url,{url,title:cleanTitle,description,sourceName});
    if(results.size>=100)break;
  }
  return [...results.values()];
}
export async function searchPublicCompetitors({proxy,book,keywords=[],topics='',exclude=[]}={}){
  const base=String(proxy||'').trim().replace(/\/+$/,'');
  if(!/^https:\/\/[^/]+$/.test(base))throw Error('Сначала подключи переходник в настройках «Директа»');
  const sources=discoverySources(book,keywords,topics).slice(0,3);
  const found=new Map(),issues=[];
  for(const source of sources){
    try{
      const response=await fetch(base+'/page?url='+encodeURIComponent(source.url),{headers:{Accept:'text/html'}});
      if(!response.ok)throw new Error('HTTP '+response.status);
      const rows=publicBundleCards(await response.text(),source.name);
      if(!rows.length)issues.push(source.name+': карточки не найдены на открытой странице');
      for(const item of rows)if(!found.has(item.url))found.set(item.url,item);
    }catch(err){issues.push(source.name+': '+(err?.message||'ошибка загрузки'));}
  }
  const excluded=new Set(exclude.map(x=>x.url).filter(Boolean));
  let candidates=[...found.values()].filter(x=>!excluded.has(x.url));
  const q=[book.title,book.genre,book.description,book.annotation,topics,...keywords.map(x=>x.phrase)].filter(Boolean).join(' ');
  if(!candidates.length)return {items:[],issues,sources:sources.map(x=>x.name)};
  // За один запуск загружаем не более 12 публичных описаний, чтобы не перегружать Литнет.
  candidates=rankPublicBooks(candidates,book,keywords,topics).slice(0,12);
  for(const c of candidates){
    if(c.description&&c.title)continue;
    try{
      const response=await fetch(base+'/page?url='+encodeURIComponent(c.url));
      if(!response.ok)continue;
      const html=await response.text(), doc=new DOMParser().parseFromString(html,'text/html');
      c.title=doc.querySelector('meta[property="og:title"]')?.getAttribute('content')||c.title;
      c.description=doc.querySelector('meta[property="og:description"]')?.getAttribute('content')||
        doc.querySelector('meta[name="description"]')?.getAttribute('content')||c.description;
    }catch{/* открытый источник может быть недоступен; это не достоверный результат */}
  }
  return {items:rankPublicBooks(candidates.filter(x=>x.title),book,keywords,topics).slice(0,12),
    issues,sources:sources.map(x=>x.name)};
}
