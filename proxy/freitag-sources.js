// Reads already-authorized sources. No model API, source writes or user-supplied endpoint.
import {sourcePeriod, sourcePlan} from "../ai/source-plan.js";
import {findStoryPassages} from "./freitag-story-map.js";

const names = {book:"Мастерская", income:"Доходы", direct:"Директ", metrika:"Метрика",
  marketing:"Маркетинг", reads:"Прочтения", cohorts:"Когорты", status:"Подключённые источники"};
const clean = value => String(value || "").toLowerCase().replace(/ё/g,"е").replace(/[^\p{L}\p{N}]+/gu," ").trim();
const rangeLabel = ({from,to}) => from ? from+" — "+to : "";
const selectedFields = (obj, keys) => Object.fromEntries(keys.filter(key=>obj?.[key]!=null).map(key=>[key,obj[key]]));

function compact(data, limit) {
  // Keep objects valid when rows get long. Preserve totals and freshness before detailed rows.
  const trim = (value, rows, chars, depth) => {
    if (typeof value === "string") return value.length>chars ? value.slice(0,chars)+"…" : value;
    if (!value || typeof value !== "object") return value;
    if (depth>7) return "…";
    if (Array.isArray(value)) {
      const result=value.slice(0,rows).map(item=>trim(item,rows,chars,depth+1));
      if (value.length>rows) result.push({remaining:value.length-rows});
      return result;
    }
    return Object.fromEntries(Object.entries(value).map(([k,v])=>[k,trim(v,rows,chars,depth+1)]));
  };
  for (const [rows,chars] of [[16,1250],[9,700],[5,420],[3,250],[1,100]]) {
    const text=JSON.stringify(trim(data,rows,chars,0));
    if (text.length<=limit) return text;
  }
  throw Error("Выборка слишком велика. Уточни книгу, кампанию или период.");
}

async function sales(env, bookId, question, period) {
  const snapshot=await env.BOOKS.get("section:income",{type:"json"});
  if (!Array.isArray(snapshot?.data?.sales)) throw Error("В Мастерской ещё нет снимка продаж.");
  const db=snapshot.data;
  const labels=[...new Set(db.sales.map(row=>row.book).filter(Boolean))];
  const inQuestion=labels.filter(title=>(" "+clean(question)+" ").includes(" "+clean(title)+" "));
  const quoted=question.match(/[«"]([^»"\n]{2,150})[»"]/u)?.[1];
  const all=/все[мх]?\s+книг|всем\s+книгам|всему\s+каталог/i.test(question);
  let selected=inQuestion;
  let title;
  if (quoted && !selected.length && !all) title=quoted;
  if (bookId && !all && !title && !selected.length) {
    const book=await env.BOOKS.get("book:"+bookId,{type:"json"});
    title=book?.title;
    if (!title && !db.sales.some(row=>row.bookId===bookId)) throw Error("Не удалось сопоставить проект с книгой в «Доходах».");
  }
  if (title) {
    const needle=clean(title);
    selected=labels.filter(value=>clean(value)===needle || (needle.length>=6 && clean(value).startsWith(needle+" ")));
    if (selected.length>1) throw Error("В «Доходах» несколько похожих названий. Укажи точное название книги.");
  }
  const restricted=!all && (!!bookId || !!title || !!selected.length);
  const rows=db.sales.filter(r=>(!restricted || selected.includes(r.book) || (!quoted && !inQuestion.length && bookId && r.bookId===bookId)) &&
    (!period.from || (r.date>=period.from && r.date<=period.to)));
  const sums=new Map(); let qty=0, kopecks=0;
  for (const row of rows) {
    const quantity=Number(row.qty)||0, royalty=Math.round((Number(row.royalty)||0)*100);
    qty+=quantity;kopecks+=royalty;
    const key=restricted?row.date.slice(0,7):row.book;
    const group=sums.get(key)||{quantity:0,kopecks:0};
    group.quantity+=quantity;group.kopecks+=royalty;sums.set(key,group);
  }
  return {at:snapshot.updatedAt,data:{period,books:restricted?(selected.length?selected:[title||bookId]):"Все книги",
    lastSaleDate:db.lastSaleDate, rowsInSnapshot:db.sales.length,matchedRows:rows.length,
    ...(db.sales.length>=5000?{coverage:"В снимке до 5000 последних строк продаж."}:{}),
    currency:"RUB",quantity:qty,royalty:kopecks/100,breakdown:[...sums].sort((a,b)=>b[1].kopecks-a[1].kopecks)
      .map(([name,v])=>({name,quantity:v.quantity,royalty:v.kopecks/100}))}};
}

async function bookFacts(env, bookId, question, read, words) {
  if (!bookId) {
    const library=await read("list_books",{});
    const normalized=" "+clean(question)+" ";
    const matches=library.filter(b=>normalized.includes(" "+clean(b.title)+" "));
    if (matches.length===1) bookId=matches[0].id;
    else {
      if (!/список|какие|перечисл|мои книги|моих книг/i.test(question))
        throw Error("Выбери книгу в Freitag или укажи её полное название.");
      return {data:{books:library.map(b=>selectedFields(b,["title","chapters","updatedAt"]))}};
    }
  }
  const b=await env.BOOKS.get("book:"+bookId,{type:"json"});
  if (!Array.isArray(b?.chapters)) throw Error("Нет подключённого снимка выбранной книги.");
  const chapterNumber=Number(question.match(/глав[а-яё]*\s*№?\s*(\d{1,4})/i)?.[1] || question.match(/(\d{1,4})(?:-?[йеяюую]+)?\s+глав/i)?.[1] || 0);
  const row=b.chapters[chapterNumber-1];
  if (chapterNumber && !row) throw Error("Такой главы нет в подключённой рукописи.");
  const phrase=question.match(/[«"]([^»"\n]{2,120})[»"]/u)?.[1];
  const terms=words(question);
  const scenes=findStoryPassages(b.chapters,{chapter:chapterNumber,terms,query:phrase===b.title?"":phrase,count:3,size:780});
  if(/(?:список|названия|перечисли).{0,15}глав|оглавлени/i.test(question))
    return {at:b.updatedAt,data:{book:b.title,chapterCount:b.chapters.length,chapters:b.chapters.map((ch,i)=>({number:i+1,title:ch.title}))}};
  const canon=String(b.context||"").split(/\n\s*\n|(?=\n#)/).map((v,i)=>({v,i,score:terms.filter(t=>clean(v).includes(t)).length}))
    .filter(x=>x.score || !x.i).sort((a,b)=>b.score-a.score||a.i-b.i).slice(0,3).map(x=>x.v.slice(0,750));
  return {at:b.updatedAt,data:{book:b.title,chapterCount:b.chapters.length,
    ...(chapterNumber?{chapter:chapterNumber,title:row.title}:{}),canon,scenes,
    ...(chapterNumber&&!scenes.length?{excerpt:row.text.slice(0,850)}:{})}};
}

export async function collectSources({env,input,read,words,now=new Date()}) {
  const {kinds,question}=sourcePlan(input);
  if (!kinds.length) return [];
  const period=kinds.some(k=>["direct","income","reads","metrika","cohorts"].includes(k))?sourcePeriod(question,now):{};
  const campaign=question.match(/(?:кампани[а-яё]*|директ|direct:)\s*(?:(?:id|№|номер|#)\s*)?[:№#]?\s*(\d{1,20})/i)?.[1];
  const args=campaign?{campaign_id:campaign}:{};
  const get=async kind=>{
    if (kind==="income") return sales(env,input.bookId,question,period);
    if (kind==="book") return bookFacts(env,input.bookId,question,read,words);
    let tool, params={...period};
    if (kind==="status") {tool="get_system_status";params={};}
    if (kind==="marketing") {
      tool=input.bookId?"get_book_marketing":"get_marketing_overview";
      params=input.bookId?{book_id:input.bookId}:{};
    }
    if (kind==="reads") {
      if (!input.bookId) throw Error("Выбери книгу для статистики прочтений.");
      tool="get_part_reads";params.book_id=input.bookId;
    }
    if (kind==="direct") {
      const queries=/поисков.{0,10}запрос/i.test(question);
      if (queries&&!campaign) throw Error("Укажи номер кампании для её поисковых запросов.");
      const report=period.from || /клик|расход|затрат|потрат|стоимост|статист|ctr|cpc|конверси|показ[ыао]/i.test(question);
      tool=queries?"get_direct_search_queries":report?"get_direct_report":campaign?"get_direct_campaign":"get_direct_overview";
      Object.assign(params,args);
    }
    if (kind==="metrika") {tool="get_metrika_sources";params.by_day=/по дням|ежеднев|динамик/i.test(question);params.group_by=/utm/i.test(question)?"utm":campaign?"direct":"source";}
    if (kind==="cohorts") {
      tool="get_cohorts";
      params.source_filter=campaign?"direct:"+campaign:question.match(/(?:utm_(?:source|campaign|content)|engine|type):[\w.%-]+/i)?.[0];
      if (!params.source_filter) throw Error("Укажи кампанию или источник когорты, например utm_source:vk.");
    }
    const data=await read(tool,params);
    if (data?.error) throw Error("Источник пока не вернул данные.");
    if(kind==="metrika" && campaign){
      const matched=rows=>(rows||[]).filter(row=>row.key?.some(key=>String(key)===campaign));
      return {at:data.fetchedAt,data:{...data,total:matched(data.total),byDay:matched(data.byDay),campaign,
        note:"Строки с точным номером кампании в ответе Метрики."}};
    }
    if (kind==="marketing") {
      const keys=["book","books",...(/отзыв/i.test(question)?["reviews"]:[]),...(/конкурс/i.test(question)?["contests"]:[]),
        ...(/блог/i.test(question)?["blogs"]:[]),...(/иде[ияй]/i.test(question)?["ideas"]:[]),"promos"];
      return {at:data.updatedAt,data:selectedFields(data,keys)};
    }
    return {at:data.updatedAt||data.fetchedAt||data.at,data};
  };
  return Promise.all(kinds.map(async kind=>{
    try {
      const result=await get(kind);
      const periodText=["income","reads","direct","metrika","cohorts"].includes(kind)?rangeLabel(period):"";
      return {kind,label:names[kind],period:periodText,updatedAt:result.at||null,
        text:compact(result.data,Math.min(6000,Math.floor(15000/kinds.length)))};
    } catch (e) {throw Error(names[kind]+". "+e.message);}
  }));
}
