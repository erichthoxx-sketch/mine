// Личная библиотека фраз для книг. Никакой выдуманной частотности или авто-добавления в рекламу.
// Wordstat: значения частотности только из официальной выгрузки пользователя.
export const normKey = x => String(x||'').trim().toLocaleLowerCase('ru').replace(/ё/g,'е').replace(/\s+/g,' ');
const h32 = s => { let h=2166136261; for(const c of s){h ^= c.charCodeAt(0);h=Math.imul(h,16777619);} return (h>>>0).toString(36); };
export const keywordId = (bookId,phrase) => 'kw_'+h32(String(bookId||'general'))+'_'+h32(normKey(phrase));
export const intentLabel = {review:'На проверку',keep:'В подборе',negative:'Кандидат в минус-фразы',reject:'Исключено'};
export const TAGS = ['review','keep','negative','reject'];
export function interestHint(phrase) {
  const text=normKey(phrase);
  if (/(?:скачать|торрент|fb2|epub|pdf|аудиокнига|слушать онлайн)/.test(text)) return {kind:'check',why:'Возможен запрос на бесплатный файл или иной формат: проверь соответствие товару'};
  if (/(?:реферат|сочинение|краткое содержание|что такое|определение)/.test(text)) return {kind:'check',why:'Скорее информационный запрос, а не намерение купить роман'};
  if (/(?:купить|электронная книга|платный роман|читать любовный роман|читать роман)/.test(text)) return {kind:'potential',why:'Возможен интерес к чтению — проверь контекст и посадочную страницу'};
  return {kind:'neutral',why:'Соответствие книге и готовность купить требуют проверки'};
}
// CSV/TSV экспорт Wordstat; разделители с кавычками. Отсутствующее значение ≠ нулевая частотность.
export function csvRows(raw, limit=1200) {
  let content=String(raw||'').replace(/^\ufeff/,'').slice(0,1_000_000);
  const first=content.split(/\r?\n/).find(x=>x.trim())||'';
  const delimiters=['\t',';',','];
  const d=delimiters.map(c=>({c,n:(first.match(new RegExp(c==='\t'?'\t':c,'g'))||[]).length})).sort((a,b)=>b.n-a.n)[0]?.c||'\t';
  const rows=[], cells=[];let cell='',quote=false;
  for(let i=0;i<content.length;i++){
    const c=content[i],next=content[i+1];
    if(c==='"'){if(quote&&next==='"'){cell+='"';i++;}else quote=!quote;}
    else if(c===d&&!quote){cells.push(cell.trim());cell='';}
    else if((c==='\n'||c==='\r')&&!quote){if(c==='\r'&&next==='\n')i++;cells.push(cell.trim());cell='';if(cells.some(Boolean))rows.push(cells.splice(0));else cells.length=0;if(rows.length>limit+1)break;}
    else cell+=c;
  }
  cells.push(cell.trim());if(cells.some(Boolean)&&rows.length<=limit)rows.push(cells);
  if(!rows.length)return [];
  const h=rows[0].map(x=>normKey(x).replace(/[\s_]+/g,''));
  const phraseCol=h.findIndex(x=>/(?:фраз|запрос|keyword|phrase|словосочетани)/.test(x));
  const freqCol=h.findIndex(x=>/(?:показ|частот|количеств|count|frequency|числозапрос)/.test(x));
  const header=phraseCol>=0;
  const phrases=new Map();
  for(const parts of rows.slice(header?1:0,limit+1)){
    const phrase=String(parts[header?phraseCol:0]||'').trim().replace(/\s+/g,' ');
    if(!phrase||phrase.length>250||/^[-\d., ]+$/.test(phrase))continue;
    const rawCount=parts[header?freqCol:1];
    let count=null;
    if(rawCount!=null&&String(rawCount).trim()!==''&&/^[\d\s\u00a0]+$/.test(String(rawCount)))count=Number(String(rawCount).replace(/[\s\u00a0]/g,''));
    const key=normKey(phrase);
    if(!key)continue;
    const prev=phrases.get(key);
    // Дубли из выгрузки — не суммируем: это не независимые переходы.
    if(!prev||((count??-1)>(prev.count??-1)))phrases.set(key,{phrase,count});
  }
  return [...phrases.values()];
}
export function plainPhrases(raw,limit=200){
  const lines=String(raw||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const map=new Map();
  for(const line of lines.slice(0,limit*2)){const key=normKey(line);if(key&&line.length<=250&&!map.has(key))map.set(key,{phrase:line,count:null});if(map.size>=limit)break;}
  return [...map.values()];
}
export function preparedKeywords(rows,bookId,source,existing=[],stamp=''){
  const byId=new Map(existing.map(x=>[x.id,x]));
  return rows.map(row=>{
    const id=keywordId(bookId,row.phrase),old=byId.get(id),hasCount=Number.isFinite(row.count)&&row.count>=0;
    return {
      ...(old||{}),id,bookId:bookId||'',phrase:row.phrase,status:old?.status||'review',
      ...(hasCount?{count:row.count,source:source==='wordstat-api'?'wordstat-api':'wordstat-import',measuredAt:stamp||new Date().toISOString()}:
        old?{}:{count:null,source:source||'manual',measuredAt:''}),
      updatedAt:new Date().toISOString(),
    };
  });
}
export function exportList(rows){ 
  const q=x=>'"'+String(x??'').replace(/"/g,'""')+'"';
  return '\ufeff'+[['Фраза','Частотность из файла','Статус','Источник'].map(q).join(';'),...rows.map(x=>[x.phrase,x.count??'',intentLabel[x.status]||'На проверку',x.source||''].map(q).join(';'))].join('\r\n');
}
