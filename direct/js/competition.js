// Анализ только ОБЩЕДОСТУПНЫХ карточек книг. Никакой закрытой статистики конкурентов.
export function safePublicBookUrl(value) {
  try {
    const u=new URL(String(value||'').trim());
    const host=u.hostname.toLowerCase().replace(/^www\./,'');
    const allowed=['litnet.com','litmarket.ru','litgorod.ru','author.today','litres.ru'];
    if(u.protocol!=='https:'||!allowed.some(h=>host===h||host.endsWith('.'+h)))return '';
    return u.toString();
  }catch{return '';}
}
export function publicBookMeta(html) {
  if(typeof DOMParser==='undefined')return {title:'',description:''};
  const doc=new DOMParser().parseFromString(String(html||''),'text/html');
  const meta=(query)=>doc.querySelector(query)?.getAttribute('content')?.trim()||'';
  const title=meta('meta[property="og:title"]')||meta('meta[name="twitter:title"]')||doc.title||'';
  const description=meta('meta[property="og:description"]')||meta('meta[name="description"]')||'';
  return {title:title.slice(0,220),description:description.slice(0,5000)};
}
export async function competitorPublicPreview(url,proxy) {
  const clean=safePublicBookUrl(url),base=String(proxy||'').trim().replace(/\/+$/,'');
  if(!clean)throw Error('Для загрузки подходит только открытая книжная страница поддерживаемой площадки');
  if(!/^https:\/\/[^/]+$/.test(base))throw Error('Подключи переходник Cloudflare в Настройках');
  const res=await fetch(base+'/page?url='+encodeURIComponent(clean));
  if(!res.ok)throw Error('Не получилось получить публичную карточку ('+res.status+')');
  const meta=publicBookMeta(await res.text());
  if(!meta.title&&!meta.description)throw Error('На странице нет доступного описания: вставь его вручную');
  return meta;
}
const stop=new Set('а и но или ведь по на за для от об о из к ко до как не ни да с со у в во это эта эти он она они его ее её их я мы вы ты что чтобы кто там тут уже был была были будет есть книга книги роман романа читать автор авторов история любовь любовный любовного весь все где когда при герои герой героиня'.split(' '));
export function tokens(text){
  const words=String(text||'').toLocaleLowerCase('ru').replace(/ё/g,'е').match(/[а-яa-z]{4,}/g)||[];
  return [...new Set(words.filter(x=>!stop.has(x)))];
}
export function competitorInsights(bookWords,items) {
  const a=new Set(tokens(bookWords)),all=[];
  for(const x of items||[]){
    const ts=tokens([x.description,x.adText,x.note].join(' '));
    for(const t of ts)all.push(t);
  }
  const freq=new Map();
  for(const t of all)freq.set(t,(freq.get(t)||0)+1);
  const shared=[...freq].filter(([key,n])=>n>=2).sort((a,b)=>b[1]-a[1]).slice(0,12);
  const overlap=[...a].filter(x=>freq.has(x));
  return {analyzed:(items||[]).length,repeated:shared.map(([term,books])=>({term,books})),overlap,
    gap:shared.map(([term])=>term).filter(x=>!a.has(x)).slice(0,8)};
}
