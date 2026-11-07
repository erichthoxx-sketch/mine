// Freitag AI — отдельная личная оболочка для локальных моделей.
// Чаты, проекты и текстовые материалы хранятся только в IndexedDB этого браузера.
// Никаких ключей и рукописей в репозитории.
const $ = (q) => document.querySelector(q);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => (globalThis.crypto?.randomUUID?.() || "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
const stamp = () => new Date().toISOString();
const DEFAULT_INSTRUCTION = "Отвечай на русском языке ясно, по делу, без демонстрации промежуточных рассуждений. Не выдумывай факты о книгах, отделяй известное из источников от предположений.";
const blank = () => ({projects:[], chats:[], docs:[], activeProjectId:null, activeChatId:null,
  settings:{endpoint:"http://localhost:11434",model:"qwen3:4b-instruct",globalInstruction:DEFAULT_INSTRUCTION,context:4096}, theme:"auto"});
let state=blank(), tab="chat", busy=false, currentController=null, db=null, connectOk=false, connectText="Подключение не проверено";
const MAX_DOC=2*1024*1024;
const openDb=()=>new Promise((resolve,reject)=>{const r=indexedDB.open("freitag-ai-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("data");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const getDb=()=>new Promise((resolve,reject)=>{const r=db.transaction("data").objectStore("data").get("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const putDb=(v)=>new Promise((resolve,reject)=>{const t=db.transaction("data","readwrite");t.objectStore("data").put(v,"state");t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
let saveChain=Promise.resolve();
const save=()=>{const snapshot=structuredClone(state); saveChain=saveChain.catch(()=>{}).then(()=>putDb(snapshot)).catch(e=>notice("Не удалось сохранить данные: "+e.message));return saveChain;};
const notice=(msg)=>{let el=$("#f-flash");if(!el){el=document.createElement("div");el.id="f-flash";el.className="f-notice f-flash";document.body.appendChild(el);}el.textContent=msg;el.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.hidden=true,7000);};
const project=(id=state.activeProjectId)=>state.projects.find(p=>p.id===id);
const chat=(id=state.activeChatId)=>state.chats.find(c=>c.id===id);
const setTheme=()=>{document.documentElement.setAttribute("data-theme",state.theme==="auto"?(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"):state.theme);};
const titleLine=(title,sub="",right="")=>'<div class="f-heading"><div><h1 class="f-title">'+esc(title)+'</h1>'+(sub?'<p class="f-subtitle">'+esc(sub)+'</p>':"")+'</div>'+right+'</div>';
const empty=(title,sub)=>'<div class="f-empty"><strong>'+esc(title)+'</strong>'+esc(sub)+'</div>';
function renderSidebar(){
  const el=$("#sidebar-content");const p=project();
  if(tab==="chat"){
    const arr=[...state.chats].sort((a,b)=>b.updated.localeCompare(a.updated));
    el.innerHTML='<button type="button" class="f-btn primary" data-action="new-chat">+ Новый чат</button>'+
      '<label class="f-label f-sidebar-label">Проект</label><select id="f-sidebar-project" class="f-select"><option value="">Без проекта</option>'+
      state.projects.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===state.activeProjectId?"selected":"")+'>'+esc(x.name)+'</option>').join("")+'</select>'+
      '<label class="f-label f-sidebar-label">Недавние чаты</label>'+
      (arr.length?'<ul class="f-list">'+arr.map(x=>'<li><button type="button" class="'+(x.id===state.activeChatId?"on":"")+'" data-action="select-chat" data-id="'+esc(x.id)+'"><span>'+esc(x.title)+'</span></button></li>').join("")+'</ul>':'<p class="f-muted">Чатов пока нет.</p>');
  }else if(tab==="projects"){
    el.innerHTML='<p class="f-muted">'+state.projects.length+' проектов</p><button type="button" data-action="add-project" class="f-btn primary">+ Создать проект</button>';
  }else if(tab==="knowledge"){
    el.innerHTML='<p class="f-muted">'+state.docs.length+' материалов<br>Сохраняются локально на этом устройстве.</p>';
  }else{
    el.innerHTML='<p class="f-muted">Freitag AI<br>Личная рабочая среда</p>';
  }
}
function renderHeader(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("on",b.dataset.nav===tab));
  $("#connection-label").textContent=connectText;
  $("#status-dot").className="f-status-dot"+(connectOk?" on":connectText==="Нет соединения"?" bad":"");
}
function render(){
  setTheme();renderHeader();renderSidebar();
  if(tab==="projects")return renderProjects();
  if(tab==="knowledge")return renderKnowledge();
  if(tab==="settings")return renderSettings();
  renderChat();
}
function renderProjects(){
  $("#panel").innerHTML='<div class="f-content">'+titleLine("Проекты","Для каждого романа — свои инструкции, материалы и чаты.",
    '<button class="f-btn primary" data-action="add-project">+ Новый проект</button>')+
    (state.projects.length?'<div class="f-projects">'+state.projects.map(p=>{
      const count=state.chats.filter(c=>c.projectId===p.id).length;
      const docs=state.docs.filter(d=>d.projectId===p.id).length;
      return '<article class="f-project-card"><h2>'+esc(p.name)+'</h2><p>'+esc(p.description||"Без описания")+'</p><p>'+count+' чатов · '+docs+' материалов</p><div class="f-row"><button class="f-btn primary" data-action="open-project" data-id="'+esc(p.id)+'">Открыть</button><button class="f-btn" data-action="edit-project" data-id="'+esc(p.id)+'">Настроить</button><button class="f-btn danger" data-action="delete-project" data-id="'+esc(p.id)+'">Удалить</button></div></article>';
    }).join("")+'</div>':empty("Проектов пока нет","Создай первый проект, например «Развод для черной вдовы»."))+
    '<p class="f-muted f-bottom-note">Все данные хранятся в этом браузере. Для переноса используй экспорт в настройках.</p></div>';
}
function renderKnowledge(){
  const docs=state.docs.filter(d=>!state.activeProjectId||d.projectId===state.activeProjectId);
  $("#panel").innerHTML='<div class="f-content">'+titleLine("Знания","Текстовые материалы, доступные выбранному проекту.")+
  '<div class="f-notice">Это не обучение весов модели. При ответе используется ограниченная подборка фрагментов документов; полноценный поиск по книгам и синхронизация с «Мастерской» будут отдельным этапом.</div>'+
  '<div class="f-section"><label class="f-label">Проект</label><select class="f-select" id="f-doc-project"><option value="">Выбери проект</option>'+
    state.projects.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===state.activeProjectId?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select></div>'+
  (state.activeProjectId?'<div class="f-section"><h2>Добавить материал</h2><p class="f-muted">Только .txt, .md или .json, до 2 МБ за файл. Содержимое сохраняется в браузере, а не публикуется в GitHub.</p><input id="f-upload" class="f-upload" type="file" accept=".txt,.md,.json,text/plain,application/json"><div class="f-row" style="margin-top:10px"><button class="f-btn" data-action="add-note">+ Добавить заметку</button></div></div>':'<div class="f-notice">Сначала создай или выбери проект.</div>')+
  '<div class="f-section"><h2>Материалы'+(state.activeProjectId?" проекта":"")+'</h2>'+
    (docs.length?'<ul class="f-list">'+docs.map(d=>'<li class="f-spread"><div><strong>'+esc(d.name)+'</strong><p class="f-muted">'+(d.text.length).toLocaleString("ru-RU")+' знаков</p></div><button class="f-btn danger" data-action="delete-doc" data-id="'+esc(d.id)+'">Удалить</button></li>').join("")+'</ul>':empty("Материалов нет","Добавь краткий канон, биографию или текстовую заметку."))+'</div></div>';
}
function renderSettings(){
  const s=state.settings;
  $("#panel").innerHTML='<div class="f-content">'+titleLine("Настройки","Локальная модель, оформление, экспорт данных.")+
  '<form id="f-settings" class="f-form"><div class="f-section"><h2>Подключение Ollama</h2>'+
  '<label for="f-endpoint">Адрес Ollama на этом компьютере</label><input id="f-endpoint" class="f-text-field" name="endpoint" value="'+esc(s.endpoint)+'" placeholder="http://localhost:11434" required>'+
  '<label for="f-model">Модель</label><input id="f-model" class="f-text-field" name="model" list="f-model-list" value="'+esc(s.model)+'" required><datalist id="f-model-list"></datalist>'+
  '<div class="f-row" style="margin-top:14px"><button type="button" class="f-btn" data-action="test-connection">Проверить соединение</button><button type="submit" class="f-btn primary">Сохранить</button></div>'+
  '<p id="f-test-status" class="f-muted">Для ответов требуется запущенная Ollama. На другом устройстве localhost означает уже то устройство, а не твой ноутбук.</p></div>'+
  '<div class="f-section"><h2>Поведение модели</h2><label for="f-global">Общая инструкция</label>'+
  '<textarea id="f-global" name="globalInstruction" class="f-textarea">'+esc(s.globalInstruction)+'</textarea>'+
  '<label for="f-context">Контекст</label><select id="f-context" name="context" class="f-select">'+
  [2048,4096,8192].map(n=>'<option value="'+n+'" '+(n===s.context?"selected":"")+'>'+n+' токенов</option>').join("")+'</select>'+
  '<p class="f-muted">Большой контекст может замедлять модель на ноутбуке.</p></div>'+
  '<div class="f-section"><h2>Внешний вид</h2><label for="f-theme">Тема</label><select id="f-theme" class="f-select" name="theme">'+
  [["auto","Как в системе"],["light","Светлая"],["dark","Темная"]].map(x=>'<option value="'+x[0]+'" '+(x[0]===state.theme?"selected":"")+'>'+x[1]+'</option>').join("")+'</select></div>'+
  '<div class="f-section"><h2>Данные</h2><p class="f-muted">Экспортируй резервную копию перед очисткой браузера. Данные между устройствами пока не синхронизируются.</p>'+
  '<div class="f-row"><button type="button" class="f-btn" data-action="export">Скачать архив JSON</button><label class="f-btn f-file-label">Импортировать JSON<input id="f-import" type="file" accept=".json,application/json" hidden></label></div></div></form></div>';
}
function renderChat(){
  let c=chat();if(c && c.projectId!==state.activeProjectId) state.activeProjectId=c.projectId||null;
  const p=project(c?.projectId||state.activeProjectId);
  if(!c){$("#panel").innerHTML='<div class="f-content">'+titleLine("Новый чат",p?'Проект: '+p.name:"Без проекта")+
    empty("С чего начнем?","Открой чат и отправь сообщение установленной модели.")+
    '<div class="f-row" style="justify-content:center"><button class="f-btn primary" data-action="new-chat">+ Создать чат</button></div></div>';return;}
  const body=c.messages.map(m=>'<div class="f-msg '+esc(m.role)+'"><span class="f-speaker">'+(m.role==="user"?"Ты":"Freitag AI")+'</span><div class="f-msg-text">'+esc(m.content)+'</div></div>').join("");
  $("#panel").innerHTML='<div class="f-chat"><div class="f-chat-meta f-spread"><div><h1 class="f-title">'+esc(c.title)+'</h1><p class="f-subtitle">'+esc(p?.name||"Без проекта")+' · '+esc(state.settings.model)+'</p></div>'+
    '<div class="f-row"><button class="f-btn" data-action="rename-chat">Переименовать</button><button class="f-btn danger" data-action="delete-chat">Удалить</button></div></div>'+
    '<div class="f-chat-body" id="f-messages">'+(body||empty("Пустой чат","Задай первый вопрос."))+'</div>'+
    '<form id="f-chat-form" class="f-compose"><textarea class="f-textarea" id="f-message-input" placeholder="Напиши сообщение… (Enter — отправить, Shift+Enter — новая строка)" aria-label="Сообщение" '+(busy?"disabled":"")+'></textarea>'+
    '<div class="f-compose-controls"><span class="f-mini">Локальная модель · '+esc(state.settings.model)+'</span><div class="f-row">'+
    (busy?'<button type="button" class="f-btn danger" data-action="stop">Остановить</button>':'<button type="submit" class="f-btn primary">Отправить</button>')+'</div></div></form></div>';
  $("#f-messages")?.lastElementChild?.scrollIntoView({block:"nearest"});
}
function ensureChat(){
  if(chat())return chat();
  const c={id:uid(),projectId:state.activeProjectId||null,title:"Новый чат",messages:[],updated:stamp()};
  state.chats.unshift(c);state.activeChatId=c.id;save();return c;
}
function openModal(title,fields,preset={},saveLabel="Сохранить"){
  const dlg=document.createElement("dialog");dlg.className="f-dialog";
  dlg.innerHTML='<form id="f-dialog-form" method="dialog"><h2>'+esc(title)+'</h2>'+
    fields.map(f=>'<label for="f-field-'+esc(f.key)+'">'+esc(f.label)+'</label>'+
      (f.multi?'<textarea class="f-textarea" id="f-field-'+esc(f.key)+'" name="'+esc(f.key)+'">'+esc(preset[f.key]||"")+'</textarea>':
      '<input class="f-text-field" id="f-field-'+esc(f.key)+'" name="'+esc(f.key)+'" value="'+esc(preset[f.key]||"")+'" '+(f.required?"required":"")+' maxlength="300">')).join("")+
    '<div class="f-row" style="justify-content:flex-end;margin-top:20px"><button class="f-btn" value="cancel">Отмена</button><button class="f-btn primary" value="save">'+esc(saveLabel)+'</button></div></form>';
  document.body.appendChild(dlg);dlg.showModal();dlg.addEventListener("close",()=>dlg.remove());
  return new Promise(resolve=>{
    dlg.querySelector("#f-dialog-form").addEventListener("submit",e=>{e.preventDefault();const btn=e.submitter;
      if(btn.value!=="save"){dlg.close();resolve(null);return;}
      const v=Object.fromEntries(new FormData(e.currentTarget).entries());if(fields.some(f=>f.required&&!v[f.key]?.trim()))return;
      dlg.close();resolve(v);
    });
    dlg.addEventListener("cancel",()=>resolve(null),{once:true});
  });
}
async function editProject(id){
  const p=project(id);const v=await openModal(p?"Настройки проекта":"Новый проект",
    [{key:"name",label:"Название",required:true},{key:"description",label:"Описание"},{key:"instruction",label:"Инструкция для модели",multi:true}],
    p||{name:"",instruction:"Отвечай с учетом канона проекта. Если факта нет в материалах, скажи об этом."});
  if(!v)return;
  if(p)Object.assign(p,{name:v.name.trim(),description:v.description.trim(),instruction:v.instruction.trim()});
  else{const q={id:uid(),name:v.name.trim(),description:v.description.trim(),instruction:v.instruction.trim()};state.projects.unshift(q);state.activeProjectId=q.id;state.activeChatId=null;}
  await save();render();
}
async function addNote(){
  if(!state.activeProjectId)return notice("Сначала выбери проект.");
  const v=await openModal("Новая заметка",[{key:"name",label:"Название",required:true},{key:"text",label:"Текст",multi:true}]);
  if(!v||!v.text.trim())return;
  state.docs.unshift({id:uid(),projectId:state.activeProjectId,name:v.name.trim(),text:v.text.slice(0,MAX_DOC),added:stamp()});
  await save();render();notice("Заметка сохранена только в этом браузере.");
}
function relevantNotes(question,projectId){
  const docs=state.docs.filter(d=>d.projectId===projectId);if(!docs.length)return "";
  const terms=[...new Set((question.toLowerCase().match(/[а-яa-z0-9]{4,}/gi)||[]))].slice(0,20);
  const scored=[];
  for(const d of docs){
    const chunks=d.text.match(/[\s\S]{1,650}/g)||[];
    chunks.forEach((chunk,i)=>{const lower=chunk.toLowerCase();const score=terms.reduce((n,t)=>n+(lower.includes(t)?1:0),0);scored.push({score:score+(d.name.toLowerCase().includes(terms[0]||"§")?1:0),text:chunk,name:d.name,i});});
  }
  scored.sort((a,b)=>b.score-a.score);
  const selected=scored.filter(x=>x.score>0).slice(0,5);
  // Если вопрос общий, подставляем начало одного документа — без претензии на полный RAG.
  if(!selected.length && docs.length)selected.push({text:docs[0].text.slice(0,900),name:docs[0].name});
  return selected.map(x=>"Источник «"+x.name+"»:\n"+x.text).join("\n\n").slice(0,3500);
}
function buildMessages(c){
  const p=project(c.projectId),s=state.settings;
  let sys=s.globalInstruction+"\n"+(p?.instruction?"\nИнструкция проекта «"+p.name+"»:\n"+p.instruction:"");
  const lastUser=[...c.messages].reverse().find(m=>m.role==="user")?.content||"";
  const knowledge=relevantNotes(lastUser,c.projectId);
  if(knowledge)sys+="\n\nДоступные выдержки из материалов проекта (цитируй точно, не выдумывай остальные главы):\n"+knowledge;
  const history=c.messages.filter(m=>m.role==="user"||m.role==="assistant").slice(-10).map(m=>({role:m.role,content:m.content.slice(-3500)}));
  while(history.reduce((n,m)=>n+m.content.length,0)>8500&&history.length>2)history.shift();
  return [{role:"system",content:sys.slice(0,5300)},...history];
}
const safeEndpoint=(endpoint)=>{
  let u;try{u=new URL(endpoint);}catch{return null;}
  if(u.username||u.password||u.search||u.hash)return null;
  if(u.protocol!=="http:"&&u.protocol!=="https:")return null;
  if(u.protocol==="http:"&&!["localhost","127.0.0.1","[::1]"].includes(u.hostname))return null;
  return u.origin+u.pathname.replace(/\/+$/,"");
};
async function testConnection(){
  const endpoint=safeEndpoint($("#f-endpoint")?.value||state.settings.endpoint);
  if(!endpoint)return notice("Разрешен локальный http://localhost:11434 или защищенный HTTPS-адрес.");
  connectText="Проверка…";renderHeader();
  try{
    const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);
    let response;try{response=await fetch(endpoint+"/api/tags",{signal:ac.signal});}finally{clearTimeout(t);}
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    const names=(data.models||[]).map(x=>x.name||x.model).filter(Boolean);
    const list=$("#f-model-list");if(list)list.innerHTML=names.map(x=>'<option value="'+esc(x)+'"></option>').join("");
    connectOk=true;connectText="Ollama доступна";const m=$("#f-test-status");
    if(m)m.textContent="Соединение работает. Доступные модели: "+(names.join(", ")||"не найдены");
    notice("Подключение к Ollama работает.");
  }catch(e){
    connectOk=false;connectText="Нет соединения";
    const m=$("#f-test-status");if(m)m.textContent="Нет соединения: "+e.message+". Проверь, что Ollama запущена и разрешен доступ браузера (CORS).";
    notice("Ollama недоступна из браузера. Это не ошибка установки модели.");
  }renderHeader();
}
async function sendMessage(text){
  if(busy||!text.trim())return;
  const endpoint=safeEndpoint(state.settings.endpoint);
  if(!endpoint)return notice("Проверь адрес Ollama в настройках.");
  const c=ensureChat(), msg=text.trim();
  c.messages.push({role:"user",content:msg,at:stamp()});
  if(c.title==="Новый чат")c.title=msg.slice(0,65);
  c.updated=stamp();await save();
  busy=true;render();
  const assistant={role:"assistant",content:"",at:stamp()};c.messages.push(assistant);
  const messages=buildMessages(c).filter((x,i,a)=>!(i===a.length-1&&x.role==="assistant"&&!x.content));
  const el=document.createElement("div");el.className="f-msg assistant";
  el.innerHTML='<span class="f-speaker">Freitag AI</span><div class="f-msg-text pending">Генерация ответа…</div>';
  $("#f-messages")?.append(el);const target=el.querySelector(".f-msg-text");
  currentController=new AbortController();
  try{
    const res=await fetch(endpoint+"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:state.settings.model,stream:true,messages,think:false,keep_alive:"5m",options:{num_ctx:Number(state.settings.context)||4096}}),signal:currentController.signal});
    if(!res.ok)throw new Error("HTTP "+res.status+": "+(await res.text()).slice(0,180));
    if(!res.body)throw new Error("Браузер не получил поток ответа");
    const reader=res.body.getReader(), decoder=new TextDecoder();let pending="";
    for(;;){
      const {done,value}=await reader.read();if(done)break;pending+=decoder.decode(value,{stream:true});
      const lines=pending.split("\n");pending=lines.pop();
      for(const line of lines){
        if(!line.trim())continue;let obj;try{obj=JSON.parse(line);}catch{continue;}
        if(obj.error)throw new Error(obj.error);
        if(obj.message?.content){assistant.content+=obj.message.content;target.classList.remove("pending");target.textContent=assistant.content;}
      }
    }
    if(!assistant.content)assistant.content="Модель не вернула текст ответа.";
    connectOk=true;connectText="Ollama доступна";
  }catch(e){
    if(e.name==="AbortError"){assistant.content=assistant.content||"Ответ остановлен.";}
    else {assistant.content="Не удалось получить ответ: "+e.message+". Проверь адрес и доступ браузера к Ollama в настройках.";connectOk=false;connectText="Нет соединения";}
    target.textContent=assistant.content;target.classList.remove("pending");
  }finally{
    busy=false;currentController=null;c.updated=stamp();await save();render();
  }
}
function download(name,content){
  const blob=new Blob([content],{type:"application/json;charset=utf-8"}),url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
async function readTextFile(file){
  if(!file||file.size>MAX_DOC)throw new Error("Файл слишком большой (максимум 2 МБ).");
  if(!/\.(txt|md|json)$/i.test(file.name))throw new Error("Поддерживаются только .txt, .md и .json");
  return file.text();
}
document.addEventListener("click",async(e)=>{
  const nav=e.target.closest("[data-nav]");if(nav){tab=nav.dataset.nav;render();return;}
  const b=e.target.closest("[data-action]");if(!b)return;
  const a=b.dataset.action,id=b.dataset.id;
  if(a==="theme"){state.theme=state.theme==="auto"?"light":state.theme==="light"?"dark":"auto";save();render();}
  if(a==="new-chat"){state.activeChatId=null;ensureChat();tab="chat";render();$("#f-message-input")?.focus();}
  if(a==="select-chat"){state.activeChatId=id;state.activeProjectId=chat(id)?.projectId||null;save();tab="chat";render();}
  if(a==="add-project")await editProject(null);
  if(a==="edit-project")await editProject(id);
  if(a==="open-project"){state.activeProjectId=id;state.activeChatId=null;save();tab="chat";render();}
  if(a==="delete-project"){const p=project(id);if(!p||!confirm("Удалить проект «"+p.name+"» и все его чаты и материалы?"))return;
    state.projects=state.projects.filter(x=>x.id!==id);state.chats=state.chats.filter(x=>x.projectId!==id);state.docs=state.docs.filter(x=>x.projectId!==id);
    if(state.activeProjectId===id){state.activeProjectId=null;state.activeChatId=null;}await save();render();}
  if(a==="add-note")await addNote();
  if(a==="delete-doc"){if(!confirm("Удалить материал?"))return;state.docs=state.docs.filter(d=>d.id!==id);await save();render();}
  if(a==="rename-chat"){const c=chat();if(!c)return;const v=await openModal("Название чата",[{key:"title",label:"Название",required:true}],{title:c.title});if(v){c.title=v.title.trim();await save();render();}}
  if(a==="delete-chat"){const c=chat();if(!c||!confirm("Удалить этот чат?"))return;state.chats=state.chats.filter(x=>x.id!==c.id);state.activeChatId=null;await save();render();}
  if(a==="stop")currentController?.abort();
  if(a==="test-connection")await testConnection();
  if(a==="export"){await save();download("FreitagAI-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify({app:"FreitagAI",version:1,data:state},null,2));}
});
document.addEventListener("submit",async(e)=>{
  if(e.target.id==="f-chat-form"){e.preventDefault();const inp=$("#f-message-input"),val=inp?.value||"";if(inp)inp.value="";await sendMessage(val);}
  if(e.target.id==="f-settings"){e.preventDefault();const fd=new FormData(e.target);
    const url=safeEndpoint(String(fd.get("endpoint")||""));if(!url)return notice("Неверный адрес Ollama.");
    state.settings.endpoint=url;state.settings.model=String(fd.get("model")||"").trim();
    state.settings.globalInstruction=String(fd.get("globalInstruction")||"").slice(0,8000);
    state.settings.context=Number(fd.get("context"))||4096;
    state.theme=String(fd.get("theme"))||"auto";await save();render();notice("Настройки сохранены.");}
});
document.addEventListener("change",async(e)=>{
  if(e.target.id==="f-sidebar-project"||e.target.id==="f-doc-project"){
    state.activeProjectId=e.target.value||null;state.activeChatId=null;await save();render();return;
  }
  if(e.target.id==="f-upload"){
    try{const file=e.target.files?.[0];if(!file)return;if(!state.activeProjectId)return notice("Выбери проект.");
      const text=await readTextFile(file);state.docs.unshift({id:uid(),projectId:state.activeProjectId,name:file.name,text,added:stamp()});await save();render();notice("Материал сохранен локально.");
    }catch(err){notice(err.message);}return;
  }
  if(e.target.id==="f-import"){
    const file=e.target.files?.[0];if(!file)return;
    try{if(file.size>25*1024*1024)throw new Error("Архив слишком большой.");
      const data=JSON.parse(await file.text());
      if(data.app!=="FreitagAI"||!Array.isArray(data.data?.projects)||!Array.isArray(data.data?.chats)||!Array.isArray(data.data?.docs))throw new Error("Это не архив Freitag AI.");
      if(!confirm("Заменить текущие чаты, проекты и материалы импортированным архивом?"))return;
      state={...blank(),...data.data,settings:{...blank().settings,...data.data.settings}};
      await save();render();notice("Архив импортирован.");
    }catch(err){notice("Ошибка импорта: "+err.message);}
  }
});
document.addEventListener("keydown",e=>{
  if(e.target.id==="f-message-input"&&e.key==="Enter"&&!e.shiftKey&&!e.isComposing){
    e.preventDefault();if(!busy)e.target.closest("form")?.requestSubmit();
  }
});
(async()=>{
  try{db=await openDb();const loaded=await getDb();if(loaded&&Array.isArray(loaded.projects)&&Array.isArray(loaded.chats))state={...blank(),...loaded,settings:{...blank().settings,...loaded.settings}};}
  catch(e){$("#panel").innerHTML=empty("Хранилище недоступно","Разреши браузеру сохранять данные сайта: "+e.message);return;}
  render();
})();
