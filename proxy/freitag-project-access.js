import {readBookTool} from "./books-mcp-worker.js";

const json=(data,status=200)=>Response.json(data,{status,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
const hash=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value))),
  n=>n.toString(16).padStart(2,"0")).join("");
const safeEqual=(one,two)=>{
  if(one.length!==two.length)return false;
  let diff=0;for(let i=0;i<one.length;i++)diff|=one.charCodeAt(i)^two.charCodeAt(i);
  return diff===0;
};
const kindSet=new Set(["project","decision","material","style","chat"]);
const validId=id=>typeof id==="string"&&/^[a-z0-9_-]{1,160}$/i.test(id);
const objectSchema=(properties={},required=[])=>({type:"object",properties,required,additionalProperties:false});
const str={type:"string"}, natural={type:"integer",minimum:0};
const tools=[
  ["list_documents","Инструкция, решения, материалы и чаты проекта. Возвращает оглавление.",{offset:natural}],
  ["read_document","Прочитать часть документа по его id и смещению.",{id:str,offset:natural},["id"]],
  ["search_project","Найти фразу в проекте, с указанием документа и позиции.",{query:str},["query"]],
  ["list_chapters","Оглавление связанной рукописи.",{offset:natural}],
  ["get_book_context","Утверждённый канон и каркас связанной книги.",{offset:natural}],
  ["search_book","Найти фразу во всех главах связанной книги.",{query:str},["query"]],
  ["read_chapter","Прочитать часть указанной главы связанной рукописи.",{chapter:{type:"integer",minimum:1},offset:natural},["chapter"]]
].map(([name,description,props,required])=>({name,description,inputSchema:objectSchema(props,required)}));
const section=(text,offset,size=6000)=>({text:text.slice(offset,offset+size),offset,nextOffset:offset+size<text.length?offset+size:null});
const message=value=>({content:[{type:"text",text:typeof value==="string"?value:JSON.stringify(value)}]});
function createTables(sql){
  sql.exec("CREATE TABLE IF NOT EXISTS grant_state (id INTEGER PRIMARY KEY, digest TEXT, version TEXT, updated TEXT, book TEXT)");
  sql.exec("CREATE TABLE IF NOT EXISTS documents (id TEXT PRIMARY KEY, title TEXT, kind TEXT, size INTEGER, position INTEGER)");
  sql.exec("CREATE TABLE IF NOT EXISTS chunks (id TEXT, part INTEGER, body TEXT, PRIMARY KEY(id,part))");
}
const CHUNK=24000;
function storePacket(store,packet,grant){
  const sql=store.sql;
  store.transactionSync(()=>{
    sql.exec("DELETE FROM chunks");sql.exec("DELETE FROM documents");
    packet.documents.forEach((d,i)=>{
      sql.exec("INSERT INTO documents VALUES (?,?,?,?,?)",d.id,d.title,d.kind,d.text.length,i);
      // Avoid splitting a UTF-16 surrogate pair across UTF-8 storage records.
      let start=0,part=0;
      while(start<d.text.length){
        let end=Math.min(start+CHUNK,d.text.length);
        if(end<d.text.length && /[\uD800-\uDBFF]/.test(d.text[end-1]))end--;
        sql.exec("INSERT INTO chunks VALUES (?,?,?)",d.id,part++,d.text.slice(start,end));start=end;
      }
    });
    sql.exec("INSERT OR REPLACE INTO grant_state VALUES (1,?,?,?,?)",grant.digest,grant.version,grant.updated,packet.bookId||"");
  });
}
function validPacket(p){
  return typeof p?.name==="string" && (!p.bookId || validId(p.bookId)) && Array.isArray(p.documents) &&
    p.documents.length>0 && p.documents.length<=10000 &&
    new Set(p.documents.map(d=>d?.id)).size===p.documents.length &&
    p.documents.every(d=>validId(d?.id)&&kindSet.has(d.kind)&&typeof d.title==="string"&&d.title.length<=240&&typeof d.text==="string") &&
    p.documents.some(d=>d.id==="project"&&d.kind==="project");
}
async function authorizeOwnerAction(req,store,current){
  if(req.method==="GET")return json({ok:true,enabled:!!current,version:current?.version,updatedAt:current?.updated});
  if(req.method!=="POST")return json({error:"Метод недоступен."},405);
  const input=await req.json().catch(()=>null);
  if(!input)return json({error:"Неверный формат."},400);
  if(input.action==="revoke"){
    store.transactionSync(()=>{for(const table of ["grant_state","chunks","documents"])store.sql.exec("DELETE FROM "+table);});
    return json({ok:true,enabled:false});
  }
  if(!["grant","update"].includes(input.action)||!validPacket(input.packet))return json({error:"Некорректный пакет проекта."},400);
  if((input.action==="grant" && current) || (input.action==="update" && (!current || current.version!==input.version)))
    return json({error:"Облачная версия изменилась. Открой доступ проекта и проверь состояние."},409);
  const version=crypto.randomUUID();
  const token=input.action==="grant"?"frg_"+crypto.randomUUID().replaceAll("-","")+crypto.randomUUID().replaceAll("-",""):"";
  const updated=new Date().toISOString(),digest=token?await hash(token):current.digest;
  // Recheck after asynchronous hashing, before the atomic replacement.
  const live=store.sql.exec("SELECT version FROM grant_state WHERE id=1").toArray()[0];
  if(live?.version!==current?.version)return json({error:"Версия проекта изменилась."},409);
  storePacket(store,input.packet,{version,digest,updated});
  return json({ok:true,enabled:true,version,updatedAt:updated,...(token?{token}:{})});
}
async function readTool(store,env,current,name,args){
  const sql=store.sql,offset=args.offset??0;
  if(!Number.isSafeInteger(offset)||offset<0)throw Error("Неверное смещение.");
  if(name==="list_documents"){
    const items=sql.exec("SELECT id,title,kind,size FROM documents ORDER BY position LIMIT 41 OFFSET ?",offset).toArray();
    return message({updatedAt:current.updated,documents:items.slice(0,40),nextOffset:items.length>40?offset+40:null});
  }
  if(name==="read_document"){
    if(!validId(args.id))throw Error("Неверный id документа.");
    const doc=sql.exec("SELECT title,size FROM documents WHERE id=?",args.id).toArray()[0];
    if(!doc)throw Error("Документ недоступен.");
    let skipped=0,text="";
    for(const row of sql.exec("SELECT body FROM chunks WHERE id=? ORDER BY part",args.id)){
      if(skipped+row.body.length>offset)text+=row.body.slice(Math.max(0,offset-skipped));
      skipped+=row.body.length;if(text.length>=6000)break;
    }
    return message({title:doc.title,text:text.slice(0,6000),offset,nextOffset:offset+6000<doc.size?offset+6000:null});
  }
  if(name==="search_project"){
    const q=args.query?.trim().toLowerCase();
    if(!q||q.length<2||q.length>150)throw Error("Фраза должна содержать от 2 до 150 знаков.");
    const matches=[];let previous="",tail="",pos=0;
    for(const chunk of sql.exec("SELECT id,body FROM chunks ORDER BY id,part")){
      if(chunk.id!==previous){previous=chunk.id;tail="";pos=0;}
      const window=tail+chunk.body,at=window.toLowerCase().indexOf(q);
      if(at!==-1)matches.push({id:chunk.id,offset:Math.max(0,pos-tail.length+at-100),
        snippet:window.slice(Math.max(0,at-100),at+q.length+180)});
      tail=window.slice(1-q.length);pos+=chunk.body.length;if(matches.length>=12)break;
    }
    return message({matches});
  }
  if(!current.book)throw Error("С проектом ещё не связана рукопись.");
  const book=await env.BOOKS.get("book:"+current.book,{type:"json"});
  if(!book)throw Error("Доступ к рукописи отозван или снимок недоступен.");
  if(name==="get_book_context")return message({...section(book.context,offset),updatedAt:book.updatedAt});
  if(name==="list_chapters")return message({updatedAt:book.updatedAt,chapters:book.chapters.slice(offset,offset+100).map((ch,i)=>({chapter:offset+i+1,title:ch.title})),nextOffset:offset+100<book.chapters.length?offset+100:null});
  if(name==="read_chapter" || name==="search_book")return readBookTool(book,name,{chapter:args.chapter,query:args.query,offset,limit:6000});
  throw Error("Инструмент недоступен.");
}

export async function projectAccess(req,store,env){
  createTables(store.sql);
  const current=store.sql.exec("SELECT * FROM grant_state WHERE id=1").toArray()[0];
  if(new URL(req.url).pathname==="/owner")return authorizeOwnerAction(req,store,current);
  const token=req.headers.get("Authorization")?.replace(/^Bearer /,"")||"";
  if(!current || !/^frg_[a-f0-9]{64}$/.test(token) || !safeEqual(await hash(token),current.digest))
    return json({error:"Требуется ключ этого проекта."},401);
  if(req.method!=="POST")return new Response(null,{status:405,headers:{Allow:"POST","Cache-Control":"no-store"}});
  const rpc=await req.json().catch(()=>null);
  const error=(code,msg)=>json({jsonrpc:"2.0",id:rpc?.id??null,error:{code,message:msg}});
  if(rpc?.jsonrpc!=="2.0"||typeof rpc.method!=="string")return error(-32600,"Invalid request");
  if(!Object.hasOwn(rpc,"id"))return new Response(null,{status:202});
  let result;
  if(rpc.method==="initialize")result={protocolVersion:["2025-11-25","2025-06-18","2025-03-26"].includes(rpc.params?.protocolVersion)?rpc.params.protocolVersion:"2025-03-26",
    serverInfo:{name:"freitag-project",version:"1.0.0"},capabilities:{tools:{}},instructions:"Начни с list_documents и read_document id=project. В ответах чата различай предложения модели и утверждённые автором решения."};
  else if(rpc.method==="ping")result={};
  else if(rpc.method==="tools/list")result={tools:current.book?tools:tools.slice(0,3)};
  else if(rpc.method==="tools/call"){
    const {name,arguments:args={}}=rpc.params||{};
    if(!tools.some(t=>t.name===name)||!args||typeof args!=="object"||Array.isArray(args))return error(-32602,"Unknown tool or arguments");
    try{result=await readTool(store,env,current,name,args);}catch(e){result={...message(e.message),isError:true};}
  }else return error(-32601,"Method not found");
  return json({jsonrpc:"2.0",id:rpc.id,result});
}
