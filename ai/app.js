// Freitag AI — персональная литературная среда: сменяемые модели, память и контекст автора.
import { master } from './master-sync.js';
// Чаты, проекты и текстовые материалы хранятся только в IndexedDB этого браузера.
// Никаких ключей и рукописей в репозитории.
const $ = (q) => document.querySelector(q);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => (globalThis.crypto?.randomUUID?.() || "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
const stamp = () => new Date().toISOString();
const DEFAULT_INSTRUCTION = "Отвечай по-русски, точно и без внутренних рассуждений. В авторском тексте сохраняй голос и факты книги. Не подменяй канон догадками и не выдумывай содержание отсутствующих глав.";
const WRITING_MODES = {
  dialog: {name:"Диалог",instruction:"Отвечай кратко и конкретно. При нехватке сведений сообщи, каких именно.",maxTokens:320},
  draft: {name:"Написать сцену",instruction:"Ты работаешь над художественной сценой. Пиши сразу прозу, не вступай с объяснениями. Соблюдай канон, POV, время, место, характеры, заданный стиль и последнюю сцену. Не изобретай события и родственные связи без запроса. Если нет нужной завязки, задай один конкретный вопрос.",maxTokens:700},
  edit: {name:"Редактор",instruction:"Редактируй только то, что просит автор. Сохраняй индивидуальный синтаксис и голос. Отмечай провисания в темпе, мотивации, диалогах и логике. Не переписывай весь отрывок, если просят точечную правку.",maxTokens:600},
  plot: {name:"Сюжет",instruction:"Работай как сюжетный редактор. Проверяй причинность, мотивацию, ставки и последствия; предлагай не более трёх конкретных вариантов и указывай слабые места без лести. Отделяй гипотезы от фактов канона.",maxTokens:520},
  canon: {name:"Проверить канон",instruction:"Проверяй факты только по закреплённому канону и приведённым выдержкам. Отвечай с названиями источников. Если подтверждения в предоставленных материалах нет, прямо скажи «в доступном контексте не найдено», не придумывай.",maxTokens:420}
};
const blank = () => ({projects:[], chats:[], docs:[], feedback:[], activeProjectId:null, activeChatId:null,
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
      return '<article class="f-project-card"><h2>'+esc(p.name)+'</h2><p>'+esc(p.description||"Без описания")+'</p><p>'+count+' чатов · '+docs+' материалов'+(p.masterBookId?" · связан с Мастерской":p.canon?" · канон закреплён":" · канон не заполнен")+'</p><div class="f-row"><button class="f-btn primary" data-action="open-project" data-id="'+esc(p.id)+'">Открыть</button><button class="f-btn" data-action="edit-project" data-id="'+esc(p.id)+'">Настроить</button><button class="f-btn danger" data-action="delete-project" data-id="'+esc(p.id)+'">Удалить</button></div></article>';
    }).join("")+'</div>':empty("Проектов пока нет","Создай первый проект, например «Развод для черной вдовы»."))+
    '<div class="f-section f-master-section"><h2>Книги из «Мастерской»</h2><p class="f-muted">Подключение только для чтения. Импортируются утверждённые факты Легенды, персонажи, каркас и синопсис; рукописи не изменяются.</p>'+
    (!master.ready?'<button class="f-btn" data-action="master-connect">Подключить аккаунт</button>':
     master.user?'<p class="f-muted">Аккаунт: '+esc(master.user.email||"подключён")+'</p>'+
       '<div class="f-row"><button class="f-btn" data-action="master-refresh">Обновить список и связанные книги</button></div>'+
       (master.books.length?'<div class="f-master-books">'+master.books.map(b=>{
         const link=state.projects.find(p=>p.masterBookId===b.id);
         return '<div class="f-master-book"><span>'+esc(b.title||"Без названия")+'</span><button class="f-btn" data-action="master-import" data-id="'+esc(b.id)+'">'+(link?"Обновить канон":"Создать проект")+'</button></div>';
       }).join("")+'</div>':'<p class="f-muted">Нажми «Обновить список и связанные книги», чтобы получить актуальные книги.</p>'):
     '<form id="f-master-auth" class="f-master-login"><label>Email Мастерской<input class="f-text-field" type="email" name="email" autocomplete="username" required></label>'+
       '<label>Пароль<input class="f-text-field" type="password" name="password" autocomplete="current-password" required></label><button class="f-btn primary" type="submit">Войти и получить книги</button></form>')+
    '</div>'+
    '<p class="f-muted f-bottom-note">Чаты и рабочие заметки пока хранятся в этом браузере — для резервной копии используй экспорт в настройках.</p></div>';
}
function renderKnowledge(){
  const docs=state.docs.filter(d=>!state.activeProjectId||d.projectId===state.activeProjectId);
  const examples=state.feedback.filter(f=>!state.activeProjectId||f.projectId===state.activeProjectId).slice().reverse();
  $("#panel").innerHTML='<div class="f-content">'+titleLine("Знания","Материалы романов и твоя личная школа письма.")+
  '<div class="f-notice">Канон из «Мастерской» и загруженные главы — источники. Авторские образцы и замечания — правила стиля. Ни один из этих материалов сам по себе не меняет веса модели.</div>'+
  '<div class="f-section"><label class="f-label">Проект</label><select class="f-select" id="f-doc-project"><option value="">Выбери проект</option>'+
    state.projects.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===state.activeProjectId?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select></div>'+
  (state.activeProjectId?'<div class="f-section"><h2>Добавить материал</h2><p class="f-muted">Только .txt, .md или .json, до 2 МБ за файл. Содержимое остаётся в твоём браузере и не публикуется на GitHub.</p><input id="f-upload" class="f-upload" type="file" accept=".txt,.md,.json,text/plain,application/json"><div class="f-row" style="margin-top:10px"><button class="f-btn" data-action="add-note">+ Добавить заметку</button></div></div>':'<div class="f-notice">Сначала создай или выбери проект.</div>')+
  '<div class="f-section"><h2>Материалы'+(state.activeProjectId?" проекта":"")+'</h2>'+
    (docs.length?'<ul class="f-list">'+docs.map(d=>'<li class="f-spread"><div><strong>'+esc(d.name)+'</strong><p class="f-muted">'+(d.text.length).toLocaleString("ru-RU")+' знаков</p></div><button class="f-btn danger" data-action="delete-doc" data-id="'+esc(d.id)+'">Удалить</button></li>').join("")+'</ul>':empty("Материалов нет","Добавь главу или текстовую заметку."))+'</div>'+
  '<div class="f-section"><div class="f-spread"><div><h2>Мой стиль · память соавтора</h2><p class="f-muted">Одобренные сцены, твои правки и причины отказов. Они будут учитываться в задании для Claude.</p></div>'+
    (state.activeProjectId?'<button class="f-btn" data-action="add-style">+ Мой образец</button>':"")+'</div>'+
    (examples.length?'<div class="f-examples">'+examples.map(x=>'<article class="f-example"><div class="f-spread"><strong>'+(x.kind==="good"?"Одобрено":"Не повторять")+' · '+esc(x.source||"Автор")+'</strong>'+
      '<button class="f-btn danger" data-action="delete-feedback" data-id="'+esc(x.id)+'">Удалить</button></div>'+
      '<p>'+esc(x.reason||"")+'</p><p class="f-muted">'+esc(String(x.finalText||x.answer||"").slice(0,260))+'</p></article>').join("")+'</div>':
      empty("Примеров пока нет","Добавь любимый абзац или сохрани ответ кнопкой «В образцы»."))+
    '</div></div>';
}
function renderSettings(){
  const s=state.settings;
  $("#panel").innerHTML='<div class="f-content">'+titleLine("Настройки","Локальная модель, оформление, экспорт данных.")+
  '<form id="f-settings" class="f-form"><div class="f-section"><h2>Подключение Ollama</h2>'+
  '<label for="f-endpoint">Адрес Ollama на этом компьютере</label><input id="f-endpoint" class="f-text-field" name="endpoint" value="'+esc(s.endpoint)+'" placeholder="http://localhost:11434" required>'+
  '<label for="f-model">Модель</label><input id="f-model" class="f-text-field" name="model" list="f-model-list" value="'+esc(s.model)+'" required><datalist id="f-model-list"></datalist>'+
  '<div class="f-row" style="margin-top:14px"><button type="button" class="f-btn" data-action="test-connection">Проверить соединение</button><button type="submit" class="f-btn primary">Сохранить</button></div>'+
  '<p id="f-test-status" class="f-muted">Для ответов требуется запущенная Ollama на этом компьютере. На телефоне localhost означает телефон, а не ноутбук.</p>'+
  '<details class="f-notice f-connection-help" open><summary>Как включить доступ к Ollama с этого сайта</summary>'+
  '<p>Freitag AI работает через HTTPS, а Ollama запущена на ноутбуке. Для связи нужны два разрешения:</p>'+
  '<p><b>1.</b> В PowerShell выполни команду ниже. Она разрешит доступ только сайту <code>'+esc(location.origin)+'</code>, а не всем сайтам:</p>'+
  '<code class="f-command">'+esc(originsCommand())+'</code>'+
  '<button type="button" class="f-btn" data-action="copy-origins">Копировать команду</button>'+
  '<p><b>2.</b> Полностью закрой Ollama через значок в области уведомлений Windows (Quit), затем открой Ollama заново.</p>'+
  '<p><b>3.</b> Нажми «Проверить соединение» выше. Если Chrome спросит разрешение на доступ к локальному устройству или сети, разреши его для Freitag AI.</p>'+
  '<p>Ollama остаётся доступной только на этом компьютере; публичный порт открывать не нужно.</p></details></div>'+
  '<div class="f-section"><h2>Поведение модели</h2><label for="f-global">Общая инструкция</label>'+
  '<textarea id="f-global" name="globalInstruction" class="f-textarea">'+esc(s.globalInstruction)+'</textarea>'+
  '<label for="f-context">Контекст</label><select id="f-context" name="context" class="f-select">'+
  [2048,4096,8192].map(n=>'<option value="'+n+'" '+(n===s.context?"selected":"")+'>'+n+' токенов</option>').join("")+'</select>'+
  '<p class="f-muted">Большой контекст может замедлять модель на ноутбуке.</p></div>'+
  '<div class="f-section"><h2>Внешний вид</h2><label for="f-theme">Тема</label><select id="f-theme" class="f-select" name="theme">'+
  [["auto","Как в системе"],["light","Светлая"],["dark","Темная"]].map(x=>'<option value="'+x[0]+'" '+(x[0]===state.theme?"selected":"")+'>'+x[1]+'</option>').join("")+'</select></div>'+
  '<div class="f-section"><h2>Моя литературная память</h2><p class="f-muted">Одобренных ответов: '+state.feedback.filter(x=>x.kind==="good").length+
  ' · Отклонённых: '+state.feedback.filter(x=>x.kind==="bad").length+'. Сохраняй примеры после редактирования: это материал для будущего дообучения. Примеры входят в JSON-архив.</p></div>'+
  '<div class="f-section"><h2>Мои данные и резервные копии</h2><p class="f-muted">Можно сохранить проекты, канон и авторские примеры в твой Firebase. Сохранение и восстановление запускаются только по твоей команде. Чаты пока входят в полный JSON-экспорт и не синхронизируются автоматически.</p>'+
  '<div class="f-row"><button type="button" class="f-btn" data-action="cloud-save">Сохранить память в Firebase</button>'+
  '<button type="button" class="f-btn" data-action="cloud-load">Восстановить память из Firebase</button></div>'+
  '<div class="f-row"><button type="button" class="f-btn" data-action="export">Скачать архив JSON</button><label class="f-btn f-file-label">Импортировать JSON<input id="f-import" type="file" accept=".json,application/json" hidden></label></div></div></form></div>';
}
function renderChat(){
  let c=chat();if(c && c.projectId!==state.activeProjectId)state.activeProjectId=c.projectId||null;
  const p=project(c?.projectId||state.activeProjectId);
  if(!c){$("#panel").innerHTML='<div class="f-content">'+titleLine("Новый чат",p?'Книга: '+p.name:"Без проекта")+
    empty("Чат ещё не создан","Нажми «Новый чат», чтобы писать прямо здесь.")+
    '<div class="f-row" style="justify-content:center"><button class="f-btn primary" data-action="new-chat">+ Новый чат</button></div></div>';return;}
  const body=c.messages.map((m,i)=>'<div class="f-msg '+esc(m.role)+'"><span class="f-speaker">'+(m.role==="user"?"Ты":m.provider==="Claude"?"Ответ Claude":"Freitag AI · локальная Qwen")+'</span><div class="f-msg-text">'+esc(m.content)+'</div>'+
    (m.role==="assistant"&&m.content&&!m.content.startsWith("Не удалось")?'<div class="f-feedback-actions"><button class="f-inline-btn" data-action="feedback-good" data-i="'+i+'">В образцы</button><button class="f-inline-btn" data-action="feedback-bad" data-i="'+i+'">Не то</button></div>':"")+
    '</div>').join("");
  const modeOptions=Object.entries(WRITING_MODES).map(([key,v])=>'<option value="'+key+'" '+((c.mode||"draft")===key?"selected":"")+'>'+esc(v.name)+'</option>').join("");
  $("#panel").innerHTML='<div class="f-chat">'+
    '<div class="f-chat-meta f-spread"><div><h1 class="f-title">'+esc(c.title)+'</h1><p class="f-subtitle">'+esc(p?.name||"Без проекта")+'</p></div>'+
    '<div class="f-row f-chat-head-actions"><button class="f-btn" data-action="rename-chat">Переименовать</button><button class="f-btn danger" data-action="delete-chat">Удалить</button></div></div>'+
    '<div class="f-chat-body" id="f-messages">'+(body||empty("Начни разговор","Напиши задачу. Ответ появится прямо в этом чате."))+'</div>'+
    '<form id="f-chat-form" class="f-compose">'+
      '<div class="f-writing-bar"><select class="f-select" id="f-writing-mode" aria-label="Режим работы" '+(busy?"disabled":"")+'>'+modeOptions+'</select>'+
      '<span class="f-writing-hint">'+(p?.masterCanon?"Легенда из Мастерской":p?.canon?"Канон указан":p?"Канон не заполнен":"Без проекта")+
      (p?' · <button type="button" class="f-inline-btn" data-action="edit-active-project">Настроить</button>':"")+'</span></div>'+
    '<textarea class="f-textarea" id="f-message-input" placeholder="Напиши сообщение или вставь сцену…" aria-label="Сообщение" '+(busy?"disabled":"")+'></textarea>'+
    '<div class="f-compose-controls">'+
      '<span class="f-mini">'+(connectOk?"● Ollama подключена":connectText==="Нет соединения"?"Нет связи с Ollama":"Локальная Qwen · "+esc(state.settings.model))+'</span>'+
      '<div class="f-row">'+(busy?'<button type="button" class="f-btn danger" data-action="stop">Остановить</button>':
      '<button type="submit" class="f-btn primary">Отправить</button>')+'</div></div>'+
    '<details class="f-extra-tools"><summary>Дополнительные инструменты</summary><div class="f-row">'+
      '<button type="button" class="f-btn" data-action="ask-claude">Подготовить задание для Claude</button>'+
      '<button type="button" class="f-btn" data-action="paste-claude">Сохранить ответ Claude</button>'+
      '<button type="button" class="f-btn" data-action="open-settings">Подключение</button></div>'+
      '<p class="f-muted">Claude здесь не подключён автоматически. Задание можно скопировать в Claude вручную; обычная кнопка «Отправить» отвечает локальной Qwen.</p></details>'+
    '</form></div>';
  $("#f-messages")?.lastElementChild?.scrollIntoView({block:"nearest"});
}
function ensureChat(){
  if(chat())return chat();
  const c={id:uid(),projectId:state.activeProjectId||null,title:"Новый чат",mode:"draft",messages:[],updated:stamp()};
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
    [{key:"name",label:"Название",required:true},{key:"description",label:"Описание"},
     {key:"canon",label:"Канон книги (постоянные факты о героях, событиях, связях)",multi:true},
     {key:"voice",label:"Голос и стиль (POV, тон, запреты)",multi:true},
     {key:"scene",label:"Где остановилась история / ближайшая сцена",multi:true},
     {key:"instruction",label:"Дополнительные указания модели",multi:true}],
    p||{name:"",instruction:"Отвечай с учетом канона проекта. Если факта нет в материалах, скажи об этом."});
  if(!v)return;
  const details={name:v.name.trim(),description:v.description.trim(),instruction:v.instruction.trim(),
    canon:(v.canon||"").trim(),voice:(v.voice||"").trim(),scene:(v.scene||"").trim()};
  if(p)Object.assign(p,details);
  else{const q={id:uid(),...details};state.projects.unshift(q);state.activeProjectId=q.id;state.activeChatId=null;}
  await save();render();
}
async function addNote(){
  if(!state.activeProjectId)return notice("Сначала выбери проект.");
  const v=await openModal("Новая заметка",[{key:"name",label:"Название",required:true},{key:"text",label:"Текст",multi:true}]);
  if(!v||!v.text.trim())return;
  state.docs.unshift({id:uid(),projectId:state.activeProjectId,name:v.name.trim(),text:v.text.slice(0,MAX_DOC),added:stamp()});
  await save();render();notice("Заметка сохранена только в этом браузере.");
}
// Поиск по материалам полностью локальный: отбираем короткие отрывки, а не
// отправляем в маленькую модель весь роман. Для продолжения сцены добавляем
// контекст из закреплённых сведений проекта, независимо от результатов поиска.
function searchTerms(question) {
  const stop = new Set(["который","которая","которые","этого","этому","чтобы","нужно","можно","потом","сейчас","только","глава","главе","главу","текст","сцена","сцену","роман","книге","пожалуйста","почему","какой","какая","какие"]);
  return [...new Set((String(question).toLowerCase().replace(/ё/g,"е").match(/[а-яa-z0-9]{4,}/g)||[])
    .filter(w=>!stop.has(w))
    .map(w=>w.length>=6?w.slice(0,-2):w.slice(0,-1))
    .filter(w=>w.length>=3))].slice(0,22);
}
function relevantNotes(question,projectId,maxLength=2200){
  if(!projectId)return "";
  const docs=state.docs.filter(d=>d.projectId===projectId);
  const terms=searchTerms(question);
  if(!docs.length||!terms.length)return "";
  const scored=[];
  for(const d of docs){
    const title=d.name.toLowerCase().replace(/ё/g,"е");
    const normalized=d.text.toLowerCase().replace(/ё/g,"е");
    for(let at=0;at<d.text.length;at+=750){
      const excerpt=d.text.slice(at,at+900);
      const part=normalized.slice(at,at+900);
      let score=0;
      for(const term of terms){
        if(part.includes(term))score+=1;
        if(title.includes(term))score+=2;
      }
      if(score)scored.push({name:d.name,text:excerpt,score,at});
    }
  }
  scored.sort((a,b)=>b.score-a.score||a.at-b.at);
  const out=[],seen=new Map();
  for(const item of scored){
    if((seen.get(item.name)||0)>=2)continue;
    const remaining=maxLength-out.join("\n\n").length;
    if(remaining<250||out.length>=4)break;
    out.push("Из «"+item.name+"» (фрагмент около знака "+(item.at+1)+"):\n"+item.text.slice(0,Math.min(remaining-100,900)));
    seen.set(item.name,(seen.get(item.name)||0)+1);
  }
  return out.join("\n\n");
}
// Если канон длиннее бюджета, сохраняем его начало (общие правила)
// и добавляем относящийся к текущему вопросу фрагмент вместо обрезания
// всегда на первых строках.
function pinnedExcerpt(raw,question,maxLength){
  const text=String(raw||"");
  if(text.length<=maxLength)return text;
  const head=text.slice(0,Math.min(250,Math.floor(maxLength*.25)));
  const terms=searchTerms(question);
  const pieces=[];
  const normalized=text.toLowerCase().replace(/ё/g,"е");
  for(let at=head.length;at<text.length;at+=450){
    const chunk=normalized.slice(at,at+520);
    const score=terms.reduce((n,term)=>n+(chunk.includes(term)?1:0),0);
    if(score)pieces.push({score,at});
  }
  pieces.sort((a,b)=>b.score-a.score||a.at-b.at);
  const slots=pieces.length?pieces.slice(0,2).sort((a,b)=>a.at-b.at):[{at:Math.max(head.length,text.length-(maxLength-head.length))}];
  let result=head;
  for(const item of slots){
    const remaining=maxLength-result.length-8;
    if(remaining<90)break;
    result+="\n[…]\n"+text.slice(item.at,item.at+Math.min(remaining,520));
  }
  return result.slice(0,maxLength);
}
function buildMessages(c){
  const p=project(c.projectId),s=state.settings;
  const mode=WRITING_MODES[c.mode]||WRITING_MODES.dialog;
  const ctx=Number(s.context)||4096;
  const short=ctx<=2048,long=ctx>=8192;
  const budget=short?
    {total:2100,global:220,extra:160,canon:500,voice:160,scene:250,docs:400,history:1500}:
    long?
    {total:6000,global:500,extra:450,canon:1700,voice:500,scene:750,docs:1100,history:6500}:
    {total:3850,global:330,extra:280,canon:1100,voice:300,scene:420,docs:850,history:2800};
  const lastUser=[...c.messages].reverse().find(m=>m.role==="user")?.content||"";
  const parts=[
    s.globalInstruction.slice(0,budget.global),
    "Режим «"+mode.name+"». "+mode.instruction,
    p?.instruction?"Инструкция проекта «"+p.name+"»: "+p.instruction.slice(0,budget.extra):"",
    p?.masterCanon?"УТВЕРЖДЁННАЯ ЛЕГЕНДА ИЗ МАСТЕРСКОЙ:\n"+pinnedExcerpt(p.masterCanon,lastUser,Math.round(budget.canon*.6)):"",
    p?.canon?"ДОПОЛНЕНИЯ АВТОРА К КАНОНУ:\n"+pinnedExcerpt(p.canon,lastUser,p.masterCanon?Math.round(budget.canon*.4):budget.canon):"",
    p?.voice?"Голос автора и ограничения:\n"+p.voice.slice(0,budget.voice):"",
    p?.scene?"ТЕКУЩАЯ СЦЕНА/ПОСЛЕДНИЕ СОБЫТИЯ:\n"+p.scene.slice(0,budget.scene):"",
    "Выдержки не равны полной рукописи. Если данных недостаточно, скажи об этом.",
    relevantNotes(lastUser,c.projectId,budget.docs)
  ].filter(Boolean);
  let sys=parts.join("\n\n");
  if(sys.length>budget.total){
    // Сохраняем найденные выдержки: сначала сокращаем второстепенные
    // инструкции, затем хвост истории. При обычном бюджете лимит не достигается.
    sys=sys.slice(0,budget.total);
  }
  const history=c.messages.filter(m=>m.role==="user"||m.role==="assistant").slice(-7).map(m=>({role:m.role,content:m.content.slice(-1800)}));
  while(history.reduce((n,m)=>n+m.content.length,0)>budget.history&&history.length>1)history.shift();
  return [{role:"system",content:sys},...history];
}
// На GitHub Pages обращение к локальному Ollama требует разрешения Chrome (LNA)
// и CORS-разрешения для ТОЧНОГО origin этого сайта в настройках Ollama.
const originsCommand=()=>"[Environment]::SetEnvironmentVariable('OLLAMA_ORIGINS','"+location.origin+"','User')";
const ollamaRequest=(endpoint,path,options={})=>{
  const u=new URL(endpoint);
  const isLoopback=u.protocol==="http:"&&["localhost","127.0.0.1","[::1]"].includes(u.hostname);
  return fetch(endpoint+path,{...options,mode:"cors",...(isLoopback?{targetAddressSpace:"loopback"}:{})});
};
const connectionHint=()=> "Проверь, что Ollama запущена. Для доступа с сайта разреши локальную сеть в Chrome и добавь адрес Freitag AI в OLLAMA_ORIGINS (Настройки → Подключение).";
const safeEndpoint=(endpoint)=>{
  let u;try{u=new URL(endpoint);}catch{return null;}
  if(u.username||u.password||u.search||u.hash)return null;
  if(u.protocol!=="http:"&&u.protocol!=="https:")return null;
  if(u.protocol==="http:"&&!["localhost","127.0.0.1","[::1]"].includes(u.hostname))return null;
  return u.origin+u.pathname.replace(/\/+$/,"");
};
async function probeLocalConnection(){
  const endpoint=safeEndpoint(state.settings.endpoint);
  if(!endpoint)return;
  connectText="Проверка Ollama…";renderHeader();
  try{
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),6000);
    let response;
    try{response=await ollamaRequest(endpoint,"/api/tags",{signal:controller.signal});}
    finally{clearTimeout(timeout);}
    if(!response.ok)throw Error("HTTP "+response.status);
    const json=await response.json();
    connectOk=true;connectText="Ollama подключена";
    const found=(json.models||[]).some(m=>(m.name||m.model)===state.settings.model);
    if(!found)connectText="Модель не обнаружена";
  }catch{connectOk=false;connectText="Нет соединения";}
  renderHeader();
  const mini=document.querySelector(".f-compose-controls .f-mini");
  if(mini)mini.textContent=connectOk?"● Ollama подключена":connectText==="Нет соединения"?"Нет связи с Ollama":connectText;
}
async function testConnection(){
  const endpoint=safeEndpoint($("#f-endpoint")?.value||state.settings.endpoint);
  if(!endpoint)return notice("Разрешен локальный http://localhost:11434 или защищенный HTTPS-адрес.");
  connectText="Проверка…";renderHeader();
  try{
    const ac=new AbortController(),t=setTimeout(()=>ac.abort(),8000);
    let response;try{response=await ollamaRequest(endpoint,"/api/tags",{signal:ac.signal});}finally{clearTimeout(t);}
    if(!response.ok)throw new Error("HTTP "+response.status);
    const data=await response.json();
    const names=(data.models||[]).map(x=>x.name||x.model).filter(Boolean);
    const list=$("#f-model-list");if(list)list.innerHTML=names.map(x=>'<option value="'+esc(x)+'"></option>').join("");
    connectOk=true;connectText="Ollama доступна";const m=$("#f-test-status");
    if(m)m.textContent="Соединение работает. Доступные модели: "+(names.join(", ")||"не найдены");
    notice("Подключение к Ollama работает.");
  }catch(e){
    connectOk=false;connectText="Нет соединения";
    const m=$("#f-test-status");if(m)m.textContent="Нет соединения: "+e.message+". "+connectionHint();
    notice("Нет доступа к Ollama из браузера. Открой инструкцию в настройках.");
  }renderHeader();
}
// Основной литературный движок — Claude через существующий аккаунт автора.
// Подписка Claude не даёт права на вызовы Claude API; поэтому никаких скрытых
// запросов или ключей: пользователь сама вставляет подготовленное задание.
function buildClaudeBrief(c){
  const p=project(c.projectId), mode=WRITING_MODES[c.mode]||WRITING_MODES.draft;
  const question=[...c.messages].reverse().find(m=>m.role==="user")?.content||"";
  const all=state.feedback.filter(f=>f.projectId===c.projectId);
  const good=all.filter(f=>f.kind==="good").slice(-3);
  const bad=all.filter(f=>f.kind==="bad").slice(-3);
  const memory=[
    ...good.map((f,i)=>"ОДОБРЕННЫЙ ПРИМЕР "+(i+1)+(f.reason?" — "+f.reason:"")+":\n"+String(f.finalText||f.answer).slice(0,2100)),
    ...bad.map((f,i)=>"НЕ ПОВТОРЯТЬ "+(i+1)+": "+(f.reason||"Автор отклонила фрагмент")+
      "\nНежелательный пример: "+String(f.answer||"").slice(0,350)+
      (f.finalText?"\nАвторский вариант: "+f.finalText.slice(0,1200):""))
  ].join("\n\n");
  const recent=c.messages.slice(-9,-1).map(m=>(m.role==="assistant"?"ОТВЕТ":"АВТОР")+": "+String(m.content).slice(0,2200)).join("\n\n").slice(-9000);
  const source=p?.masterCanon?
    "УТВЕРЖДЁННЫЙ КАНОН ИЗ «МАСТЕРСКОЙ» (исключены отвергнутые и неутверждённые главы):\n"+
      (p.masterCanon.length>36000?pinnedExcerpt(p.masterCanon,question,36000):p.masterCanon):"";
  return [
    "Ты — опытный литературный соавтор и редактор автора. Работай на русском языке.",
    "Режим: "+mode.name+". "+mode.instruction,
    "Главное правило: факты книги не менять без запроса, авторский голос не стирать. Не используй шаблонную нейросетевую прозу; если в источниках нет данных, не выдумывай и отметь пробел.",
    p?"РОМАН: "+p.name:"",
    source,
    p?.canon?"ДОПОЛНЕНИЯ АВТОРА К КАНОНУ:\n"+p.canon.slice(0,9000):"",
    p?.voice?"ПРАВИЛА АВТОРСКОГО СТИЛЯ:\n"+p.voice.slice(0,9000):"",
    p?.scene?"ТЕКУЩАЯ СЦЕНА:\n"+p.scene.slice(0,9000):"",
    p?.instruction?"ДРУГИЕ УКАЗАНИЯ:\n"+p.instruction.slice(0,5000):"",
    memory?"ЛИЧНЫЕ ПРЕДПОЧТЕНИЯ, СОХРАНЁННЫЕ ПО РЕШЕНИЮ АВТОРА:\n"+memory:"",
    relevantNotes(question,c.projectId,7000)?"НАЙДЕННЫЕ ФРАГМЕНТЫ МАТЕРИАЛОВ (это лишь выборка):\n"+relevantNotes(question,c.projectId,7000):"",
    recent?"ПРЕДЫДУЩИЕ РЕПЛИКИ В РАБОЧЕМ ЧАТЕ:\n"+recent:"",
    "ТЕКУЩАЯ ЗАДАЧА АВТОРА:\n"+question,
    "Сначала выполни именно задачу. Не добавляй похвалу, рекламные обещания и длинное вступление."
  ].filter(Boolean).join("\n\n---\n\n").slice(0,85000);
}
function openClaudeTransfer(prompt){
  document.querySelector("#f-claude-modal")?.remove();
  const dlg=document.createElement("dialog");dlg.id="f-claude-modal";dlg.className="f-dialog f-transfer-dialog";
  dlg.innerHTML='<div class="f-transfer"><h2>Задание для Claude готово</h2>'+
    '<p class="f-muted">Это не API-интеграция: книга и память пока остаются у тебя. В Claude отправится только текст, который ты сама вставишь.</p>'+
    '<textarea class="f-textarea" id="f-claude-brief" readonly aria-label="Подготовленный контекст">'+esc(prompt)+'</textarea>'+
    '<div class="f-row f-transfer-actions"><button class="f-btn primary" type="button" data-transfer="copy">Копировать задание</button>'+
    '<a class="f-btn" target="_blank" rel="noopener noreferrer" href="https://claude.ai/new">Открыть Claude</a>'+
    '<button class="f-btn" type="button" data-transfer="close">Закрыть</button></div>'+
    '<p class="f-muted">Вставь задание в Claude. Потом верни ответ сюда кнопкой «Добавить ответ Claude», чтобы сохранить его и обучающий пример.</p></div>';
  document.body.appendChild(dlg);dlg.showModal();
  dlg.addEventListener("close",()=>dlg.remove(),{once:true});
  dlg.addEventListener("click",async e=>{
    const action=e.target.closest("[data-transfer]")?.dataset.transfer;
    if(action==="close"){dlg.close();return;}
    if(action==="copy"){
      const field=dlg.querySelector("#f-claude-brief");
      try{await navigator.clipboard.writeText(field.value);notice("Задание скопировано. Теперь вставь его в Claude.");}
      catch{field.focus();field.select();notice("Нажми Ctrl+C, чтобы скопировать выделенный текст.");}
    }
  });
}
async function prepareClaude(text){
  if(busy||!text.trim())return;
  const c=ensureChat(),q=text.trim();
  c.messages.push({role:"user",content:q,at:stamp()});
  if(c.title==="Новый чат")c.title=q.slice(0,65);
  c.updated=stamp();
  const brief=buildClaudeBrief(c);
  await save();render();openClaudeTransfer(brief);
}
async function saveClaudeAnswer(){
  const c=chat();if(!c)return notice("Сначала открой чат.");
  const v=await openModal("Сохранить ответ Claude",[{key:"text",label:"Вставь текст ответа Claude",multi:true,required:true}]);
  if(!v?.text?.trim())return;
  c.messages.push({role:"assistant",content:v.text.trim().slice(0,160000),provider:"Claude",at:stamp()});
  c.updated=stamp();await save();render();notice("Ответ Claude сохранён в рабочем чате.");
}
async function saveFeedback(i,kind){
  const c=chat(),response=c?.messages[i];
  if(!c||response?.role!=="assistant")return;
  const title=kind==="good"?"Добавить в образцы":"Сохранить отказ и правку";
  const v=await openModal(title,[
    {key:"reason",label:kind==="good"?"Что в этом тексте удачно?":"Что не нравится / чего нельзя повторять?",multi:true,required:true},
    {key:"finalText",label:"Твоя окончательная редакция (необязательно)",multi:true}
  ],{reason:"",finalText:kind==="good"?response.content.slice(0,10000):""});
  if(!v?.reason?.trim())return;
  const preceding=[...c.messages.slice(0,i)].reverse().find(m=>m.role==="user");
  state.feedback.push({id:uid(),projectId:c.projectId,chatId:c.id,kind,reason:v.reason.trim().slice(0,1500),
    prompt:preceding?.content?.slice(0,10000)||"",answer:response.content.slice(0,18000),
    finalText:v.finalText.trim().slice(0,18000),source:response.provider||"Qwen",at:stamp()});
  await save();notice(kind==="good"?"Пример добавлен в память стиля.":"Отказ и причина сохранены для следующих заданий.");
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
  const assistant={role:"assistant",provider:"Qwen",content:"",at:stamp()};c.messages.push(assistant);
  const messages=buildMessages(c).filter((x,i,a)=>!(i===a.length-1&&x.role==="assistant"&&!x.content));
  const el=document.createElement("div");el.className="f-msg assistant";
  el.innerHTML='<span class="f-speaker">Freitag AI</span><div class="f-msg-text pending">Генерация ответа…</div>';
  $("#f-messages")?.append(el);const target=el.querySelector(".f-msg-text");
  currentController=new AbortController();
  try{
    const res=await ollamaRequest(endpoint,"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:state.settings.model,stream:true,messages,think:false,keep_alive:"5m",options:{num_ctx:Number(state.settings.context)||4096,num_predict:(WRITING_MODES[c.mode]||WRITING_MODES.dialog).maxTokens}}),signal:currentController.signal});
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
    else {assistant.content="Не удалось подключиться к Ollama: "+e.message+". "+connectionHint();connectOk=false;connectText="Нет соединения";}
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
  if(a==="master-connect"){
    try{await master.init();if(master.user)await master.refresh();render();notice(master.user?"Книги из Мастерской получены.":"Войди с тем же аккаунтом, что в Мастерской.");}
    catch(err){notice("Не удалось подключить Мастерскую: "+err.message);render();}
  }
  if(a==="master-refresh"){
    try{await master.refresh();let changed=0;for(const p of state.projects){
      const b=master.books.find(x=>x.id===p.masterBookId);
      if(b){p.masterCanon=master.canonicalText(b);p.masterSyncedAt=stamp();changed++;}
    }await save();render();notice("Книги обновлены. Связанных проектов: "+changed);}
    catch(err){notice("Ошибка чтения из Мастерской: "+err.message);}
  }
  if(a==="master-import"){
    const b=master.books.find(x=>x.id===id);if(!b)return;
    let p=state.projects.find(x=>x.masterBookId===b.id);
    if(!p){
      p={id:uid(),name:b.title||"Книга без названия",description:"Канон автоматически из Мастерской",instruction:"Не нарушай утверждённый канон.",canon:"",voice:"",scene:"",masterBookId:b.id};
      state.projects.unshift(p);
    }
    p.masterCanon=master.canonicalText(b);p.masterSyncedAt=stamp();
    state.activeProjectId=p.id;state.activeChatId=null;await save();render();notice("Книга «"+p.name+"» связана с Freitag AI.");
  }
  if(a==="edit-active-project"){const selected=project(chat()?.projectId||state.activeProjectId);if(selected)await editProject(selected.id);}
  if(a==="open-project"){state.activeProjectId=id;state.activeChatId=null;save();tab="chat";render();}
  if(a==="delete-project"){const p=project(id);if(!p||!confirm("Удалить проект «"+p.name+"» и все его чаты и материалы?"))return;
    state.projects=state.projects.filter(x=>x.id!==id);state.chats=state.chats.filter(x=>x.projectId!==id);state.docs=state.docs.filter(x=>x.projectId!==id);
    if(state.activeProjectId===id){state.activeProjectId=null;state.activeChatId=null;}await save();render();}
  if(a==="add-note")await addNote();
  if(a==="add-style"){
    if(!state.activeProjectId)return notice("Выбери проект.");
    const v=await openModal("Мой образец письма",[
      {key:"reason",label:"Что мне нравится в этом фрагменте / правило стиля",multi:true,required:true},
      {key:"finalText",label:"Фрагмент моего окончательного текста",multi:true,required:true}
    ]);
    if(v?.reason?.trim()&&v?.finalText?.trim()){
      state.feedback.push({id:uid(),projectId:state.activeProjectId,chatId:null,kind:"good",
        reason:v.reason.trim().slice(0,1500),prompt:"",answer:"",
        finalText:v.finalText.trim().slice(0,18000),source:"Автор",at:stamp()});
      await save();render();notice("Твой авторский образец сохранён в памяти Freitag AI.");
    }
  }
  if(a==="delete-feedback"){
    if(!confirm("Удалить этот пример из памяти стиля?"))return;
    state.feedback=state.feedback.filter(x=>x.id!==id);await save();render();
  }
  if(a==="delete-doc"){if(!confirm("Удалить материал?"))return;state.docs=state.docs.filter(d=>d.id!==id);await save();render();}
  if(a==="rename-chat"){const c=chat();if(!c)return;const v=await openModal("Название чата",[{key:"title",label:"Название",required:true}],{title:c.title});if(v){c.title=v.title.trim();await save();render();}}
  if(a==="delete-chat"){const c=chat();if(!c||!confirm("Удалить этот чат?"))return;state.chats=state.chats.filter(x=>x.id!==c.id);state.activeChatId=null;await save();render();}
  if(a==="stop")currentController?.abort();
  if(a==="test-connection")await testConnection();
  if(a==="ask-local"){const v=$("#f-message-input")?.value||"";if(v.trim()){await sendMessage(v);}else notice("Напиши задачу.");}
  if(a==="ask-claude"){const v=$("#f-message-input")?.value||"";if(v.trim()){await prepareClaude(v);}else notice("Сначала напиши задачу, чтобы подготовить её для Claude.");}
  if(a==="paste-claude")await saveClaudeAnswer();
  if(a==="feedback-good"||a==="feedback-bad")await saveFeedback(Number(b.dataset.i),a==="feedback-good"?"good":"bad");
  if(a==="open-settings"){tab="settings";render();}
  if(a==="cloud-save"){
    if(!confirm("Сохранить проекты, канон и одобренные/отклонённые примеры в твой Firebase? Чаты не загружаются."))return;
    try{const res=await master.saveMemory(state.projects,state.feedback);notice("Память сохранена в Firebase: "+res.projectIds.length+" проектов, "+res.feedbackIds.length+" примеров.");}
    catch(err){notice("Облако: "+err.message);}
  }
  if(a==="cloud-load"){
    if(!confirm("Загрузить сохранённую память из Firebase? Совпадающие проекты и примеры будут обновлены, остальные локальные данные останутся."))return;
    try{const res=await master.loadMemory();
      const p=new Map(state.projects.map(x=>[x.id,x])),f=new Map(state.feedback.map(x=>[x.id,x]));
      for(const x of res.projects)p.set(x.id,x);
      for(const x of res.feedback)f.set(x.id,x);
      state.projects=[...p.values()];state.feedback=[...f.values()];
      await save();render();notice("Память восстановлена: "+res.projects.length+" проектов, "+res.feedback.length+" примеров.");
    }catch(err){notice("Облако: "+err.message);}
  }
  if(a==="copy-origins"){try{await navigator.clipboard.writeText(originsCommand());notice("Команда скопирована. Выполни её в PowerShell и перезапусти Ollama.");}catch{prompt("Скопируй команду для PowerShell:",originsCommand());}}
  if(a==="export"){await save();download("FreitagAI-"+new Date().toISOString().slice(0,10)+".json",JSON.stringify({app:"FreitagAI",version:1,data:state},null,2));}
});
document.addEventListener("submit",async(e)=>{
  if(e.target.id==="f-chat-form"){e.preventDefault();const inp=$("#f-message-input"),val=inp?.value||"";if(!val.trim())return;if(inp)inp.value="";await sendMessage(val);}
  if(e.target.id==="f-master-auth"){
    e.preventDefault();const fd=new FormData(e.target);const password=String(fd.get("password")||"");
    try{await master.login(String(fd.get("email")||"").trim(),password);render();notice("Мастерская подключена. Книги доступны только для чтения.");}
    catch(err){notice("Вход в Мастерскую не удался: "+err.message);}return;
  }
  if(e.target.id==="f-settings"){e.preventDefault();const fd=new FormData(e.target);
    const url=safeEndpoint(String(fd.get("endpoint")||""));if(!url)return notice("Неверный адрес Ollama.");
    state.settings.endpoint=url;state.settings.model=String(fd.get("model")||"").trim();
    state.settings.globalInstruction=String(fd.get("globalInstruction")||"").slice(0,8000);
    state.settings.context=Number(fd.get("context"))||4096;
    state.theme=String(fd.get("theme"))||"auto";await save();render();notice("Настройки сохранены.");}
});
document.addEventListener("change",async(e)=>{
  if(e.target.id==="f-writing-mode"){
    const c=chat();if(c&&WRITING_MODES[e.target.value]){c.mode=e.target.value;await save();notice("Режим: "+WRITING_MODES[c.mode].name);}
    return;
  }
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
      state={...blank(),...data.data,feedback:Array.isArray(data.data.feedback)?data.data.feedback:[],settings:{...blank().settings,...data.data.settings}};
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
  state.feedback=Array.isArray(state.feedback)?state.feedback:[];
  render();
  // Не требуем от пользователя вручную проверять уже настроенную Ollama
  // при каждом обновлении страницы. Это тихая проверка без всплывающих окон.
  probeLocalConnection().catch(()=>{});
})();
