import { feedbackForContext, usableReply } from "./project-context.js";

// Explicitly select one project. Connection settings, provider keys, balances and other projects never enter the packet.
export function projectPacket(state, project) {
  const documents=[];
  const add=(id,kind,title,text)=>{
    if(typeof text==="string" && text.trim()) documents.push({id,kind,title:String(title||kind).slice(0,240),text});
  };
  const parts=[
    ["Описание",project.description],["Общие указания автора",state.settings?.globalInstruction],
    ["Инструкция проекта",project.instruction],["Сюжетная карта",project.storyMap],["Канон автора",project.canon],
    ["Голос",project.voice],["Текущая сцена",project.scene]
  ];
  add("project","project",project.name,parts.filter(([,value])=>value).map(([label,value])=>"## "+label+"\n\n"+value).join("\n\n") || project.name);
  for (const note of project.memoryNotes||[]) {
    const anchor=note.anchor?.chapter?"Глава "+note.anchor.chapter+(note.anchor.scene?", сцена "+note.anchor.scene:"")+"\n\n":"";
    add("note-"+note.id,"decision",note.title,anchor+(note.text||""));
  }
  for (const d of state.docs || []) if (d.projectId===project.id && d.includeInContext!==false)
    add("material-"+d.id,"material",d.name,d.text);
  for (const f of feedbackForContext(state.feedback,project.id))
    add("style-"+f.id,"style",f.kind==="bad"?"Что исправить":"Образец автора",[f.reason,f.finalText||(f.kind==="good"?f.answer:"")].filter(Boolean).join("\n\n"));
  for (const c of state.chats||[]) if (c.projectId===project.id) {
    const messages=(c.messages||[]).filter(m=>m.content && usableReply(m,c.id,state.feedback))
      .map(m=>(m.role==="user"?"Автор":"Ответ модели")+(m.at?" · "+m.at:"")+"\n"+m.content);
    add("chat-"+c.id,"chat",c.title,messages.join("\n\n"));
  }
  return {name:project.name,bookId:project.masterBookId||"",documents};
}
export function packetMarkdown(packet) {
  return "# "+packet.name+"\n\n"+(packet.bookId?"Книга в Мастерской · https://erichthoxx-sketch.github.io/mine/workshop/#/book/"+encodeURIComponent(packet.bookId)+"\n\n":"")+
    packet.documents.map(d=>"## "+d.title+"\n\n"+d.text).join("\n\n---\n\n");
}

export function projectAccessClient({master,gateway,getState,notify,isBusy,download}){
  const pending=new Set(), sessions=new Map();
  let timer;
  const prefs=()=>{
    const uid=master.user?.uid;
    if(!uid)return {};
    if(!sessions.has(uid)){
      let value={};try{value=JSON.parse(localStorage.getItem("freitag-project-access:"+uid))||{};}catch{}
      sessions.set(uid,value);
    }
    return sessions.get(uid);
  };
  const persist=()=>{
    if(master.user)try{localStorage.setItem("freitag-project-access:"+master.user.uid,JSON.stringify(prefs()));}catch{}
  };
  const request=async(id,body,uid=master.user?.uid)=>{
    const token=await master.idToken();
    if(!uid || master.user?.uid!==uid)throw Error("Войди в аккаунт Мастерской.");
    const base=gateway();
    if(!base)throw Error("Открой рабочий адрес Freitag.");
    const res=await fetch(base+"/project-access?project="+encodeURIComponent(id),{
      method:body?"POST":"GET",headers:{Authorization:"Bearer "+token,...(body?{"Content-Type":"application/json"}:{})},
      body:body?JSON.stringify(body):undefined,cache:"no-store",signal:AbortSignal.timeout(45000)});
    const result=await res.json();
    if(!res.ok||!result.ok)throw Object.assign(Error(result.error||"Пакет проекта недоступен."),{status:res.status});
    if(master.user?.uid!==uid)throw Error("Аккаунт изменился.");
    return result;
  };
  const checksum=async packet=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",new TextEncoder().encode(JSON.stringify(packet)))),
    b=>b.toString(16).padStart(2,"0")).join("");
  const send=async(project,action,version)=>{
    if(pending.has(project.id))throw Error("Идёт обновление проекта.");
    const owner=master.user?.uid,stable=prefs();
    pending.add(project.id);
    try{
      const packet=projectPacket(getState(),project),digest=await checksum(packet);
      if(action==="auto"&&digest===stable[project.id]?.digest)return;
      const info=await request(project.id,{action:action==="auto"?"update":action,packet,version},owner);
      stable[project.id]={version:info.version,digest};persist();
      return info;
    }finally{pending.delete(project.id);}
  };
  async function sync(){
    if(!master.user||isBusy())return;
    const stable=prefs();
    for(const project of getState().projects){
      const grant=stable[project.id];
      if(!grant || grant.paused || pending.has(project.id))continue;
      try{await send(project,"auto",grant.version);}catch(error){
        if(error.status===409){grant.paused=true;persist();notify("Доступ к проекту «"+project.name+"» изменился. Проверь его в книге.");}
        else if(!grant.warned){grant.warned=true;notify("Пакет для другого ИИ пока не обновлён. Freitag повторит синхронизацию.");}
      }
    }
  }
  const schedule=()=>{if(!Object.keys(prefs()).length)return;clearTimeout(timer);timer=setTimeout(()=>void sync(),5000);};
  const revoke=async id=>{await request(id,{action:"revoke"});delete prefs()[id];persist();};
  function open(project) {
    const dialog=document.createElement("dialog");dialog.className="f-dialog f-workflow-dialog";
    dialog.setAttribute("aria-label","Передать проект");
    dialog.innerHTML='<header><h2>Передать проект</h2></header><p>Другой помощник сможет читать инструкции, решения, материалы, завершённые сообщения и связанную рукопись этой книги.</p>'+
      '<p class="f-muted" role="status"></p><div class="f-source-actions"></div><div class="f-workflow-content"></div>';
    const status=dialog.querySelector('[role="status"]'),actions=dialog.querySelector(".f-source-actions"),fields=dialog.querySelector(".f-workflow-content");
    let current;
    function button(title,fn){
      const b=document.createElement("button");b.type="button";b.className="f-btn";b.textContent=title;
      b.onclick=async()=>{b.disabled=true;try{await fn();}catch(err){status.textContent=err.message;}finally{b.disabled=false;}};
      actions.append(b);return b;
    }
    function field(label,value){
      const row=document.createElement("label");row.className="f-label";row.append(label);
      const input=document.createElement("input");input.className="f-text-field";input.readOnly=true;input.value=value;
      input.onfocus=()=>input.select();row.append(input);fields.append(row);
    }
    function controls(info,token){
      current=info;actions.replaceChildren();fields.replaceChildren();
      status.textContent=info?.enabled?"Доступ включён. Обновлено "+new Date(info.updatedAt).toLocaleString("ru-RU")+".":info?"Доступ выключен.":"";
      if(info && !info.enabled)button("Включить доступ на чтение",async()=>{
        const result=await send(project,"grant");controls(result,result.token);
      });
      if(info?.enabled){
        field("Адрес MCP","https://freitag-opus-gateway.erichtho-xx.workers.dev/project-mcp?project="+encodeURIComponent(project.id));
        if(token){field("Заголовок Authorization · сохрани ключ сейчас","Bearer "+token);}
        else fields.append(document.createTextNode("Ключ показывается при включении. Для нового ключа отзови доступ и включи его снова."));
        button("Обновить из этого устройства",async()=>{const result=await send(project,"update",current.version);controls(result,token);});
        button("Отозвать доступ",async()=>{await revoke(project.id);controls({enabled:false});});
      }
      button("Скачать проект в Markdown",()=>download("Freitag — "+project.name+".md",packetMarkdown(projectPacket(getState(),project)),"text/markdown;charset=utf-8"));
      button("Закрыть",()=>dialog.close());
    }
    controls(null);status.textContent="Проверяю доступ…";
    dialog.addEventListener("close",()=>{fields.replaceChildren();dialog.remove();},{once:true});
    document.body.append(dialog);dialog.showModal();
    master.init().then(()=>request(project.id)).then(info=>{if(dialog.open)controls(info);}).catch(error=>{status.textContent=error.message;});
  }
  return {open,schedule,sync,revoke,managed:id=>!!prefs()[id]};
}
