// Freitag AI — персональная литературная среда: сменяемые модели, память и контекст автора.
import { projectAccessClient } from "./handoff.js";
import { chapterCues, isAcknowledgement, isSimpleGreeting, sourcePlan } from "./source-plan.js";
import { master } from './master-sync.js';
import { renderMarkdown } from './markdown.js';
import { projectHomeHtml } from './project-view.js';
import { feedbackForContext, isServiceReply, materialMode, projectMemoryContext, rejectedReply, usableReply } from './project-context.js';
import { draftDelivery, draftDeliveryLabel } from './draft-delivery.js';
import { ensureDriveAccess, refreshLinkedBook } from './live-context.js';
import { DEFAULT_CHAPTER_LIMIT, CHAPTER_LIMITS, DEFAULT_CHAPTER_EFFORT, CHAPTER_EFFORTS } from './chapter-limits.js';
import { MAX_MATERIAL_LENGTH, readMaterial } from './materials.js';
import { bookReceipt, contextLines, openRequestEstimate, openStoryMap, openChapterJobs } from './author-workflow.js';
import { canReconcileExpense, expenseFromMessage, expenseReport, expensesHtml, mergeExpenses, restoreExpenses, savedEstimate } from './expenses.js';
// Чаты, проекты и текстовые материалы хранятся только в IndexedDB этого браузера.
// Никаких ключей и рукописей в репозитории.
const $ = (q) => document.querySelector(q);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const uid = () => (globalThis.crypto?.randomUUID?.() || "id-" + Date.now() + "-" + Math.random().toString(36).slice(2));
const stamp = () => new Date().toISOString();
const userInstruction = v => typeof v === "string" ? v : "";
const WRITING_MODES = {
  dialog: {name:"Диалог",instruction:"Отвечай кратко и конкретно. При нехватке сведений сообщи, каких именно.",maxTokens:320},
  draft: {name:"Написать сцену",instruction:"Ты работаешь над художественной сценой. Пиши сразу прозу, не вступай с объяснениями. Соблюдай канон, POV, время, место, характеры, заданный стиль и последнюю сцену. Не изобретай события и родственные связи без запроса. Если нет нужной завязки, задай один конкретный вопрос.",maxTokens:700},
  edit: {name:"Редактор",instruction:"Редактируй только то, что просит автор. Сохраняй индивидуальный синтаксис и голос. Отмечай провисания в темпе, мотивации, диалогах и логике. Не переписывай весь отрывок, если просят точечную правку.",maxTokens:600},
  plot: {name:"Сюжет",instruction:"Работай как сюжетный редактор. Проверяй причинность, мотивацию, ставки и последствия; предлагай не более трёх конкретных вариантов и указывай слабые места без лести. Отделяй гипотезы от фактов канона.",maxTokens:520},
  canon: {name:"Проверить канон",instruction:"Проверяй факты только по закреплённому канону и приведённым выдержкам. Отвечай с названиями источников. Если подтверждения в предоставленных материалах нет, прямо скажи «в доступном контексте не найдено», не придумывай.",maxTokens:420}
};
const blank = () => ({projects:[], chats:[], docs:[], feedback:[], expenses:[], drafts:{}, activeProjectId:null, activeChatId:null,
  settings:{provider:"bothub",endpoint:"http://localhost:11434",model:"qwen3:4b-instruct",workerUrl:"",bothubModel:"claude-opus-5.5",sceneOutputTokens:DEFAULT_CHAPTER_LIMIT,
    chapterEffort:DEFAULT_CHAPTER_EFFORT,globalInstruction:"",context:4096}, theme:"auto"});
let state=blank(), tab="chat", projectHomeId=null, materialsProjectId=null, busy=false, preparingPaid=false, currentController=null, db=null, connectOk=false, connectText="Подключение не проверено", pendingMode=null, batchCheck=null;
let importingMaterials=false;
let refreshingExpenses=false, lastBillingSync=0, billingIssue="";
const billingCursor=new Map();
const billingProviders=["bothub","apimira"];
const expenseFilters={period:"30",project:"",provider:"",unit:""};
const openDb=()=>new Promise((resolve,reject)=>{const r=indexedDB.open("freitag-ai-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("data");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const getDb=(key="state")=>new Promise((resolve,reject)=>{const r=db.transaction("data").objectStore("data").get(key);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const putDb=(v,rollback)=>new Promise((resolve,reject)=>{
  const t=db.transaction("data","readwrite"),store=t.objectStore("data");
  if(rollback)store.put(rollback,"before-cloud-restore");
  store.put(v,"state");t.oncomplete=resolve;t.onabort=()=>reject(t.error);t.onerror=()=>reject(t.error);
});
let saveChain=Promise.resolve();
const save=()=>{const snapshot=structuredClone(state); saveChain=saveChain.catch(()=>{}).then(()=>putDb(snapshot))
  .then(()=>{handoff.schedule();return true;}).catch(e=>{notice("Не удалось сохранить данные: "+e.message);return false;});return saveChain;};
const notice=(msg)=>{let el=$("#f-flash");if(!el){el=document.createElement("div");el.id="f-flash";el.className="f-notice f-flash";document.body.appendChild(el);}el.textContent=msg;el.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.hidden=true,7000);};
const project=(id=state.activeProjectId)=>state.projects.find(p=>p.id===id);
const chat=(id=state.activeChatId)=>state.chats.find(c=>c.id===id);
const materialsProject=()=>project(materialsProjectId)||project(chat()?.projectId)||project()||state.projects[0];
// Drafts are private to each conversation or to the initial composer for a book.
// They are persisted in the existing IndexedDB, never sent to a provider until submission.
const draftKey=()=>chat()?"chat:"+chat().id:"new:"+(state.activeProjectId||"none");
let draftSaveTimer=null;
const rememberDraft=(text)=>{
  if(!state.drafts || typeof state.drafts!=="object")state.drafts={};
  state.drafts[draftKey()]=text;
  clearTimeout(draftSaveTimer);
  draftSaveTimer=setTimeout(()=>save(),550);
};
const setTheme=()=>{document.documentElement.setAttribute("data-theme",state.theme==="auto"?(matchMedia("(prefers-color-scheme:dark)").matches?"dark":"light"):state.theme);};
const titleLine=(title,sub="",right="")=>'<div class="f-heading"><div><h1 class="f-title">'+esc(title)+'</h1>'+(sub?'<p class="f-subtitle">'+esc(sub)+'</p>':"")+'</div>'+right+'</div>';
const empty=(title,sub)=>'<div class="f-empty"><strong>'+esc(title)+'</strong>'+esc(sub)+'</div>';
const CLOUD_PREFS_KEY="freitag-cloud-archive";
const ARCHIVE_INTERVAL=60*60*1000;
let cloudPrefs={},cloudPending=false,cloudStatus="",lastArchiveCheck=0;
try{cloudPrefs=JSON.parse(localStorage.getItem(CLOUD_PREFS_KEY))||{};}catch{}
function cloudBackupEnabled(){
  return cloudPrefs.enabled===true&&cloudPrefs.uid===master.user?.uid;
}
function setCloudPrefs(prefs){
  cloudPrefs=prefs;
  try{localStorage.setItem(CLOUD_PREFS_KEY,JSON.stringify(prefs));return true;}
  catch{return false;}
}
function cloudBackupStatus(){
  if(cloudStatus)return cloudStatus;
  if(!cloudBackupEnabled())return "Автокопия на этом устройстве выключена.";
  return "Последняя копия в Firebase: "+new Date(cloudPrefs.savedAt).toLocaleString("ru-RU")+".";
}
function updateCloudControls(){
  const status=$("#f-cloud-status"),button=$('[data-action="archive-save"]'),pause=$('[data-action="archive-pause"]');
  if(status)status.textContent=cloudBackupStatus();
  if(button)button.textContent=cloudBackupEnabled()?"Сохранить сейчас":"Включить облачную копию";
  if(pause)pause.hidden=!cloudBackupEnabled();
  for(const control of document.querySelectorAll('[data-action^="archive-"]'))control.disabled=cloudPending;
  const undo=$('[data-action="archive-undo"]');if(undo)undo.hidden=!cloudPrefs.undo;
}
function renderSidebar(){
  const el=$("#sidebar-content");
  if(tab==="chat"){
    const selected=state.activeProjectId||null;
    const arr=state.chats.filter(x=>(x.projectId||null)===selected)
      .sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||"")));
    el.innerHTML=
      '<button type="button" class="f-btn primary f-new-chat" data-action="new-chat"><span aria-hidden="true">＋</span> Новый чат</button>'+
      '<button type="button" class="f-btn f-new-chat" data-action="open-chapter-jobs">Фоновые главы</button>'+
      '<div class="f-side-section"><label for="f-sidebar-project" class="f-side-label">Диалоги по книге</label>'+
      '<select id="f-sidebar-project" class="f-select" aria-label="Активная книга"><option value="">Без книги</option>'+
      state.projects.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?"selected":"")+'>'+esc(x.name)+'</option>').join("")+
      '</select></div>'+
      '<div class="f-side-section f-side-history">'+
      (arr.length?'<ul class="f-list f-chat-list">'+arr.map(x=>
        '<li><button type="button" class="'+(x.id===state.activeChatId?"on":"")+
        '" data-action="select-chat" data-id="'+esc(x.id)+'" title="'+esc(x.title)+'">'+chatListLabel(x,arr)+'</button></li>'
      ).join("")+'</ul>':'<p class="f-sidebar-empty">Здесь появятся диалоги по выбранной книге.</p>')+
      '</div>';
  }else if(tab==="projects"||tab==="knowledge"){
    el.innerHTML='<div class="f-side-label">Библиотека</div>'+
      '<p class="f-sidebar-empty">'+state.projects.length+' книг в работе</p>'+
      '<button type="button" data-action="add-project" class="f-btn f-new-chat">＋ Добавить книгу</button>';
  }else if(tab==="expenses"){
    el.replaceChildren();
  }else{
    el.innerHTML='<div class="f-side-label">Подключения</div>'+
      '<p class="f-sidebar-empty">Здесь настраиваются модели, внешний вид и резервные копии.</p>';
  }
}
function renderHeader(){
  const activeTab=tab==="knowledge"?"projects":tab;
  document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("on",b.dataset.nav===activeTab));
  $("#connection-label").textContent=connectText;
  $("#status-dot").className="f-status-dot"+(connectOk?" on":connectText==="Нет соединения"?" bad":"");
}
function render(){
  // Chat gets the full available viewport; other pages remain document-scrolled.
  const wasChat=document.documentElement.classList.contains("f-chat-mode");
  document.documentElement.classList.toggle("f-chat-mode",tab==="chat");
  if(tab==="chat"&&!wasChat)document.scrollingElement?.scrollTo(0,0);
  setTheme();renderHeader();renderSidebar();
  if(tab==="projects")return projectHomeId?renderProjectHome():renderProjects();
  if(tab==="knowledge")return renderKnowledge();
  if(tab==="expenses")return renderExpenses();
  if(tab==="settings")return renderSettings();
  renderChat();
}
function renderProjectHome(){
  const p=project(projectHomeId);
  if(!p){projectHomeId=null;return renderProjects();}
  $("#panel").innerHTML=projectHomeHtml(p,state.chats,state.docs,userInstruction);
}
function renderProjects(){
  $("#panel").innerHTML='<div class="f-content">'+titleLine("Мои книги","Канон, стиль и диалоги — отдельно для каждой истории.",
    '<button class="f-btn primary" data-action="add-project">+ Новый проект</button>')+
    (state.projects.length?'<div class="f-projects">'+state.projects.map(p=>{
      const count=state.chats.filter(c=>c.projectId===p.id).length;
      const docs=state.docs.filter(d=>d.projectId===p.id).length;
      return '<article class="f-project-card"><h2>'+esc(p.name)+'</h2><p>'+esc(p.description||"Без описания")+'</p><p>'+count+' чатов · '+docs+' материалов'+(p.masterBookId?" · связан с Мастерской":p.canon?" · канон закреплён":" · канон не заполнен")+'</p><div class="f-row"><button class="f-btn primary" data-action="open-project" data-id="'+esc(p.id)+'">Открыть проект</button><button class="f-btn" data-action="edit-project" data-id="'+esc(p.id)+'">Настроить</button><button class="f-btn danger" data-action="delete-project" data-id="'+esc(p.id)+'">Удалить</button></div></article>';
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
    '<p class="f-muted f-bottom-note">Чаты и память хранятся на этом устройстве. Личную облачную копию можно включить в настройках.</p></div>';
}
function renderKnowledge(){
  const p=materialsProject();
  const docs=state.docs.filter(d=>d.projectId===p?.id);
  const examples=state.feedback.filter(f=>f.projectId===p?.id).slice().reverse();
  $("#panel").innerHTML='<div class="f-content f-materials-page">'+
  (p?'<button type="button" class="f-project-back" data-action="project-home" data-id="'+esc(p.id)+'">← '+esc(p.name)+'</button>':"")+
  titleLine("Материалы")+
  (p?'<section class="f-materials-toolbar">'+
    (docs.length>1?'<input type="search" class="f-text-field f-material-search" id="f-material-search" placeholder="Найти материал" aria-label="Поиск по названию">':"")+
    '<div class="f-row"><button class="f-btn primary" type="button" data-action="choose-materials" '+(importingMaterials?'disabled':'')+'>'+
    (importingMaterials?'Читаю файлы…':'Загрузить файлы')+'</button><input id="f-upload" type="file" accept=".docx,.txt,.md,.json" multiple hidden>'+
    '<button class="f-btn" type="button" data-action="add-note">Добавить заметку</button></div></section>'+
    '<p class="f-material-hint f-muted">Word до 10 МБ · TXT, Markdown и JSON до 2 МБ. Новые материалы участвуют в автоподборе. Для важной заметки выбери «В приоритете». Архив исключён из подбора.</p>'+
    (docs.length?'<ul class="f-material-list">'+docs.map(d=>{
      const format=d.format||/\.(docx|txt|md|json)$/i.exec(d.name)?.[1]||"заметка";
      return '<li data-material-name="'+esc(d.name)+'"><div class="f-material-title"><button type="button" data-action="open-doc" data-id="'+esc(d.id)+'">'+esc(d.name)+'</button>'+
        '<p class="f-muted">'+esc(format==='заметка'?'Заметка':format.toUpperCase())+' · '+String(d.text||"").length.toLocaleString("ru-RU")+' знаков</p></div>'+
        '<select class="f-select f-material-use" data-doc-context="'+esc(d.id)+'" aria-label="Использование материала '+esc(d.name)+'">'+
        [["auto","Автоподбор"],["priority","В приоритете"],["archive","В архиве"]].map(([value,label])=>
          '<option value="'+value+'" '+(materialMode(d)===value?"selected":"")+'>'+label+'</option>').join("")+'</select></li>';
    }).join("")+'</ul><p id="f-material-no-matches" class="f-muted" hidden>Материалы с таким названием не найдены.</p>':
      empty("Материалов пока нет","Загрузи текст или добавь заметку к проекту."))+
    '<details class="f-material-style"><summary>Образцы стиля'+(examples.length?' · '+examples.length:'')+'</summary>'+
    '<div class="f-row"><button class="f-btn" type="button" data-action="add-style">Добавить образец</button></div>'+
    (examples.length?'<div class="f-examples">'+examples.map(x=>'<article class="f-example"><div class="f-spread"><strong>'+(x.kind==="good"?"Одобрено":"Не повторять")+' · '+esc(x.source||"Автор")+'</strong>'+
      '<button class="f-btn danger" data-action="delete-feedback" data-id="'+esc(x.id)+'">Удалить</button></div>'+
      '<p>'+esc(x.reason||"")+'</p><p class="f-muted">'+esc(String(x.finalText||x.answer||"").slice(0,260))+'</p></article>').join("")+'</div>':
      '<p class="f-muted">Сюда можно добавить свой текст или сохранить удачный ответ из чата.</p>')+'</details>':
    empty("Выбери проект для материалов","Файлы и заметки привязываются к книге.")+
    '<button class="f-btn primary" type="button" data-action="add-project">Новый проект</button>')+'</div>';
}
function renderExpenses(){
  const projects=new Map(state.projects.map(p=>[p.id,p]));
  for(const row of state.expenses){
    if(row.projectId&&!projects.has(row.projectId))
      projects.set(row.projectId,{id:row.projectId,name:row.projectName||"Удалённый проект"});
  }
  $("#panel").innerHTML=expensesHtml(expenseReport(state.expenses,expenseFilters),expenseFilters,
    {esc,projects:[...projects.values()],chats:new Set(state.chats.map(c=>c.id)),providers:state.expenses.some(row=>row.provider==="aitunnel")?{...providerNames,aitunnel:"AITUNNEL"}:providerNames,refreshing:refreshingExpenses,issue:billingIssue});
}
function renderSettings(){
  const s=state.settings;
  const provider=s.provider||"ollama";
  $("#panel").innerHTML=
    '<div class="f-content f-settings-page">'+
    titleLine("Настройки","Все необходимое для работы. Технические параметры — в дополнительных разделах.")+
    '<form id="f-settings" class="f-form">'+
    '<section class="f-settings-card"><div class="f-section-kicker">01 / МОДЕЛЬ</div>'+
    '<h2>Кто отвечает</h2><p class="f-muted">Выбери модель для новых сообщений. Существующие чаты останутся на месте.</p>'+
    '<label for="f-provider">Модель</label><select id="f-provider" name="provider" class="f-select">'+
    [["ollama","Локальная Ollama · Qwen"],["modelproxy","Claude Opus 5.5 · ModelProxy"],["bothub","BotHub · Claude"],["apimira","ApiMira · Claude Opus 5.5"]].map(x=>
      '<option value="'+x[0]+'" '+(x[0]===provider?"selected":"")+'>'+x[1]+'</option>').join("")+'</select>'+
    '<div id="f-bothub-model-row" '+(provider==="bothub"?"":'hidden')+'><label for="f-bothub-model">Модель BotHub</label>'+
    '<select id="f-bothub-model" name="bothubModel" class="f-select">'+
    [["claude-sonnet-5.5","Sonnet 5.5 · на каждый день"],["claude-opus-5.5","Opus 5.5 · сложные задачи"]].map(x=>
      '<option value="'+x[0]+'" '+(x[0]===s.bothubModel?"selected":"")+'>'+x[1]+'</option>').join("")+'</select></div>'+
    '<div class="f-row f-connection-row"><button type="button" class="f-btn" data-action="test-connection">Проверить соединение</button>'+
    '<span id="f-test-status" class="f-muted" role="status">Проверка не выполняет платную генерацию.</span></div>'+
    '<div id="f-modelproxy-funds" '+(provider==="modelproxy"?"":"hidden")+'><a class="f-inline-btn" href="https://modelproxy.org/dashboard/topup?lang=ru" target="_blank" rel="noopener noreferrer">Пополнить в ModelProxy ↗</a> <span class="f-muted">USDT в сети Tron (TRC-20)</span></div>'+
    '<details class="f-settings-fold"><summary>Защищенный API-шлюз</summary>'+
    '<div class="f-fold-body"><label for="f-worker">Cloudflare Worker</label>'+
    '<input id="f-worker" class="f-text-field" name="workerUrl" value="'+esc(s.workerUrl||"")+'" placeholder="https://freitag-opus-gateway....workers.dev">'+
    '<p class="f-muted">По рабочему адресу Freitag AI шлюз выбирается автоматически. Freitag AI напрямую вызывает MCP-инструменты Мастерской для чтения книг, доходов, маркетинга и Директа. Для главы используется последний снимок книги в Мастерской. После правок в рукописи нажми «Обновить Google Docs» в проекте. Секреты хранятся только в Cloudflare.</p></div></details>'+
    '<details class="f-settings-fold"><summary>Локальная Ollama · дополнительные настройки</summary>'+
    '<div class="f-fold-body"><label for="f-endpoint">Адрес Ollama</label>'+
    '<input id="f-endpoint" class="f-text-field" name="endpoint" value="'+esc(s.endpoint)+'" placeholder="http://localhost:11434" required>'+
    '<label for="f-model">Название локальной модели</label>'+
    '<input id="f-model" class="f-text-field" name="model" list="f-model-list" value="'+esc(s.model)+'" required><datalist id="f-model-list"></datalist>'+
    '<label for="f-context">Контекст локальной модели</label>'+
    '<select id="f-context" name="context" class="f-select">'+
    [2048,4096,8192].map(n=>'<option value="'+n+'" '+(n===s.context?"selected":"")+'>'+n+' токенов</option>').join("")+'</select>'+
    '<details class="f-settings-fold f-connection-help"><summary>Инструкция по подключению на Windows</summary>'+
    '<div class="f-fold-body"><p>Разреши Ollama принимать запросы с этого адреса, затем перезапусти Ollama.</p>'+
    '<code class="f-command">'+esc(originsCommand())+'</code>'+
    '<button type="button" class="f-btn" data-action="copy-origins">Скопировать команду</button>'+
    '<p class="f-muted">На телефоне localhost не подключается к Ollama, установленной на компьютере.</p></div></details>'+
    '</div></details></section>'+
    '<section class="f-settings-card"><div class="f-section-kicker">02 / ПИСЬМО</div>'+
    '<h2>Как работать с текстом</h2>'+
    '<label for="f-global">Общая инструкция</label>'+
    '<textarea id="f-global" name="globalInstruction" class="f-textarea f-instruction" rows="5">\n'+esc(s.globalInstruction)+'</textarea>'+
    '<p class="f-muted">Настройки конкретной книги и ее канон задаются в разделе «Книги».</p></section>'+
    '<section class="f-settings-card"><div class="f-section-kicker">03 / ИНТЕРФЕЙС</div>'+
    '<h2>Оформление</h2><label for="f-theme">Цветовая тема</label>'+
    '<select id="f-theme" class="f-select" name="theme">'+
    [["auto","Как в системе"],["light","Светлая"],["dark","Темная"]].map(x=>
      '<option value="'+x[0]+'" '+(x[0]===state.theme?"selected":"")+'>'+x[1]+'</option>').join("")+'</select></section>'+
    '<details class="f-settings-card f-settings-storage"><summary>Резервные копии и мои данные</summary>'+
    '<div class="f-fold-body">'+
    '<h2>Облачная копия Firebase</h2>'+
    '<p class="f-muted">В твоём аккаунте Firebase сохраняются проекты, чаты, черновики, материалы и память. Сохраняются две последние версии. Пока Freitag открыта, автокопия проверяет изменения раз в час.</p>'+
    '<p class="f-muted" id="f-cloud-status" role="status">'+esc(cloudBackupStatus())+'</p>'+
    '<div class="f-row"><button type="button" class="f-btn primary" data-action="archive-save" '+(cloudPending?"disabled":"")+'>'+(cloudBackupEnabled()?"Сохранить сейчас":"Включить облачную копию")+'</button>'+
    '<button type="button" class="f-btn" data-action="archive-load" '+(cloudPending?"disabled":"")+'>Восстановить из облака</button>'+
    '<button type="button" class="f-inline-btn" data-action="archive-load-previous" '+(cloudPending?"disabled":"")+'>Предыдущая версия</button>'+
    '<button type="button" class="f-inline-btn" data-action="archive-pause" '+(cloudBackupEnabled()?"":"hidden")+' '+(cloudPending?"disabled":"")+'>Выключить автокопию</button>'+
    '<button type="button" class="f-inline-btn" data-action="archive-undo" '+(cloudPrefs.undo?"":"hidden")+' '+(cloudPending?"disabled":"")+'>Вернуть данные до восстановления</button></div>'+
    '<p class="f-muted">Связанные Google Docs хранятся в Мастерской. Архив сохраняет ссылки на них.</p>'+
    '<p class="f-muted">Принятых образцов: '+state.feedback.filter(x=>x.kind==="good").length+
    ' · отклоненных: '+state.feedback.filter(x=>x.kind==="bad").length+'</p>'+
    '<div class="f-row"><button type="button" class="f-btn" data-action="export">Скачать архив JSON</button>'+
    '<label class="f-btn f-file-label">Импортировать JSON<input id="f-import" type="file" accept=".json,application/json" hidden></label></div>'+
    '<details class="f-settings-fold"><summary>Копии только памяти</summary>'+
    '<div class="f-row"><button type="button" class="f-btn" data-action="cloud-save">Сохранить память и образцы</button>'+
    '<button type="button" class="f-btn" data-action="cloud-load">Восстановить память и образцы</button></div></details>'+
    '</div></details>'+
    '<div class="f-settings-save"><button type="submit" class="f-btn primary">Сохранить настройки</button></div>'+
    '</form></div>';
}
const activeBotHubModel=()=>state.settings.bothubModel==="claude-opus-5.5"?"claude-opus-5.5":"claude-sonnet-5.5";
function chapterOutputLimit(){
  const limit=Number(state.settings.sceneOutputTokens);
  return CHAPTER_LIMITS.includes(limit)?limit:DEFAULT_CHAPTER_LIMIT;
}
const activeClaudeName=()=>activeBotHubModel()==="claude-opus-5.5"?"Claude Opus 5.5":"Claude Sonnet 5.5";
const paidProviders=["modelproxy","bothub","apimira"];
const providerNames={modelproxy:"ModelProxy",bothub:"BotHub",apimira:"ApiMira"};
const effortLabels={low:"Низкий",medium:"Средний",high:"Высокий"};
const chapterEffort=()=>CHAPTER_EFFORTS.includes(state.settings.chapterEffort)?state.settings.chapterEffort:DEFAULT_CHAPTER_EFFORT;
const supportsEffort=provider=>provider==="bothub"||provider==="apimira";
const rub=value=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"RUB",maximumFractionDigits:4}).format(value);
const usd=value=>new Intl.NumberFormat("ru-RU",{style:"currency",currency:"USD",maximumFractionDigits:6}).format(value);
const activeProviderLabel=()=>state.settings.provider==="modelproxy"?"Claude Opus 5.5 · ModelProxy":
  state.settings.provider==="bothub"?activeClaudeName()+" · BotHub":
  paidProviders.includes(state.settings.provider)?"Claude Opus 5.5 · "+providerNames[state.settings.provider]:"Локальная Qwen · Ollama";
const currentModelChoice=()=>state.settings.provider==="bothub"?
  "bothub:"+activeBotHubModel():state.settings.provider;
const modelChoices=()=>[
  ["bothub:claude-opus-5.5","Opus 5.5 · BotHub"],
  ["bothub:claude-sonnet-5.5","Sonnet 5.5 · BotHub"],
  ["apimira","Opus 5.5 · ApiMira"],
  ["modelproxy","Opus 5.5 · ModelProxy"],
  ["ollama","Qwen · локально"]
].map(([id,label])=>'<option value="'+id+'" '+(currentModelChoice()===id?"selected":"")+'>'+label+'</option>').join("");
function chatListLabel(c,list){
  let label='<span>'+esc(c.title)+'</span>';
  if(list.some(other=>other.id!==c.id && other.title===c.title)){
    const last=c.messages?.findLast(m=>m.role==="assistant");
    const at=Number.isFinite(Date.parse(c.updated))?new Date(c.updated).toLocaleString("ru-RU",{day:"numeric",month:"short",hour:"2-digit",minute:"2-digit"}):"";
    const name=providerNames[last?.apiProvider]||last?.provider||"";
    label+='<small class="f-chat-version">'+esc([at,name].filter(Boolean).join(" · "))+'</small>';
  }
  return label;
}
function renderChat(){
  const outputLimit=chapterOutputLimit();
  const chapterOptions=CHAPTER_LIMITS.map(limit=>'<option value="'+limit+'" '+
    (limit===outputLimit?"selected":"")+'>'+limit.toLocaleString("ru-RU")+'</option>').join("");
  const effortOptions=CHAPTER_EFFORTS.map(effort=>'<option value="'+effort+'" '+
    (effort===chapterEffort()?"selected":"")+'>'+effortLabels[effort]+'</option>').join("");
  const c=chat();
  if(c && c.projectId!==state.activeProjectId)state.activeProjectId=c.projectId||null;
  const p=project(c?.projectId||state.activeProjectId);
  const draft=state.drafts?.[draftKey()]||"";
  const canSearchBook=p?.masterBookId&&paidProviders.includes(state.settings.provider)&&
    (c?.mode||pendingMode||"draft")==="draft";
  const previous=$("#f-messages");
  const sameChat=previous?.dataset.key===draftKey();
  const scrollTop=sameChat&&!nearEnd(previous)?previous.scrollTop:null;
  const expanded=new Set(sameChat?[...previous.querySelectorAll(".f-prompt[open]")].map(el=>el.dataset.index):[]);
  const toolsOpen=sameChat&&$("#f-chat-tools")?.open;
  let preceding;
  const body=(c?.messages||[]).map((m,i)=>{
    const text=String(m.content??"");
    if(m.role==="user")preceding=m;
    const failure=isServiceReply(m);
    const receipt=preceding?.contextReceipt;
    const diagnostics=m.role==="assistant" && preceding && (m.apiProvider || m.provider?.startsWith("Claude"))?
      '<details class="f-turn-context"><summary>Состав запроса</summary>'+
      (receipt?contextLines(receipt).map(t=>'<p>'+esc(t)+'</p>').join("")+
        (receipt.cues?'<details><summary>Показать ориентиры главы</summary><p class="f-workflow-snippet">'+esc(receipt.cues)+'</p></details>':""):
        '<p>Задание автора · '+preceding.content.length.toLocaleString("ru-RU")+' зн. Точный состав источников для этой старой записи не сохранён.</p>')+'</details>':"";
    const longPrompt=m.role==="user"&&(text.length>440||text.split("\n",7).length>6);
    const content=m.role==="assistant"?renderMarkdown(m.content):esc(text);
    const message='<div class="f-msg-text">'+content+'</div>';
    return '<article class="f-msg '+esc(m.role)+'"><div class="f-speaker">'+
    (m.role==="user"?"Ты":m.provider==="Claude"?"Claude Opus":String(m.provider||"").startsWith("Claude ") ? esc(m.provider) :m.provider==="Внешняя модель"?"Внешняя модель":"Freitag AI")+
    '</div>'+
    (longPrompt?'<details class="f-prompt" data-index="'+i+'" '+(expanded.has(String(i))?"open":"")+'><summary>Задание <span>'+text.length.toLocaleString("ru-RU")+' зн.</span></summary>'+
        message+'</details>':message)+
    (Number.isFinite(m.costRub)?'<p class="f-mini">Списано AITUNNEL: '+esc(rub(m.costRub))+'</p>':"")+
    (Number.isFinite(m.apimiraCostUsd)?'<p class="f-mini">Списано ApiMira: '+esc(usd(m.apimiraCostUsd))+
      (Number.isSafeInteger(m.apimiraTokens?.input)&&Number.isSafeInteger(m.apimiraTokens?.output)?
        ' · '+m.apimiraTokens.input.toLocaleString("ru-RU")+' токенов на входе · '+m.apimiraTokens.output.toLocaleString("ru-RU")+' на выходе':"")+'</p>':
      m.apimiraRequestId&&!busy?'<button class="f-inline-btn" type="button" data-action="apimira-receipt" data-i="'+i+'">Проверить списание ApiMira</button>':"")+
    (Number.isFinite(m.bothubCostRub)||Number.isFinite(m.bothubCostCaps)?'<p class="f-mini">Списано BotHub: '+esc([
      Number.isFinite(m.bothubCostRub)?rub(m.bothubCostRub):"",Number.isFinite(m.bothubCostCaps)?m.bothubCostCaps.toLocaleString("ru-RU")+" Caps":""
    ].filter(Boolean).join(" · "))+'</p>':m.apiProvider==="bothub"&&(m.apiRequestId||m.providerRequestId)&&!busy?
      '<button class="f-inline-btn" type="button" data-action="bothub-receipt" data-i="'+i+'">Проверить списание BotHub</button>':"")+
    (m.apiUsage&&!m.apimiraTokens?'<p class="f-mini">'+esc(apiUsageLabel(m.apiUsage,m.apiRequestId,
      Number.isFinite(m.costRub)||Number.isFinite(m.apimiraCostUsd)||Number.isFinite(m.bothubCostRub)||Number.isFinite(m.bothubCostCaps)))+'</p>':"")+
    (m.jobError?'<p class="f-mini">'+esc(m.jobError)+'</p>':"")+
    (Number.isSafeInteger(m.delivery?.characters)?'<p class="f-mini f-draft-delivery">'+esc(draftDeliveryLabel(m.delivery))+'</p>':"")+
    (m.receiving && !busy?'<p class="f-mini">Получен фрагмент. Завершение главы не подтверждено.</p>':"")+
    diagnostics+
    (failure && preceding && !busy?'<div class="f-feedback-actions"><button type="button" class="f-inline-btn" data-action="return-task" data-i="'+i+'">Вернуть задание в поле ввода</button>'+
      '<button type="button" class="f-inline-btn" data-action="open-expenses">Открыть траты</button></div>':"")+
    (m.role==="assistant" && !failure && m.content && !m.content.startsWith("Не удалось")?
      '<div class="f-feedback-actions"><button type="button" class="f-inline-btn" data-action="copy-answer" data-i="'+i+'">Копировать</button>'+
      '<button type="button" class="f-inline-btn" data-action="download-answer" data-i="'+i+'">Скачать TXT</button>'+
      (p?'<button type="button" class="f-inline-btn" data-action="remember-decision" data-i="'+i+'">В память проекта</button>':"")+
      '<button type="button" class="f-inline-btn" data-action="feedback-good" data-i="'+i+'">В образцы</button>'+
      '<button type="button" class="f-inline-btn" data-action="feedback-bad" data-i="'+i+'">'+
      (rejectedReply(m,c.id,state.feedback)?'Вернуть в контекст':'Не то')+'</button></div>':"")+
    '</article>';
  }).join("");
  const modeOptions=Object.entries(WRITING_MODES).map(([key,v])=>
    '<option value="'+key+'" '+((c?.mode||pendingMode||(p?"draft":"dialog"))===key?"selected":"")+'>'+esc(v.name)+'</option>').join("");
  const mobileChats=state.chats.filter(x=>(x.projectId||null)===(p?.id||null))
    .sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||"")));
  const mobileHistory=mobileChats.length
    ?'<div class="f-mobile-history-panel">'+mobileChats.map(x=>
       '<button type="button" data-action="select-chat" data-id="'+esc(x.id)+
       '" class="'+(x.id===state.activeChatId?"on":"")+'">'+chatListLabel(x,mobileChats)+'</button>'
      ).join("")+'</div>'
    :'<div class="f-mobile-history-panel"><p>Диалогов пока нет.</p></div>';
  const bookOptions='<option value="">Без книги</option>'+state.projects.map(x=>
    '<option value="'+esc(x.id)+'" '+(x.id===(p?.id||"")?"selected":"")+'>'+esc(x.name)+'</option>').join("");
  const source=p?.masterBookId?"Мастерская":p?"Локальный проект":"Обычный чат";
  $("#panel").innerHTML=
    '<section class="f-chat" aria-label="Литературный чат">'+
    '<div class="f-chat-meta"><div class="f-chat-identity">'+
    '<h1 class="f-title">'+esc(c?.title&&c.title!=="Новый чат"?c.title:"Новый диалог")+'</h1>'+
    '<div class="f-chat-book"><label for="f-chat-project">Книга</label>'+
    '<select id="f-chat-project" class="f-select" aria-label="Выбрать книгу">'+bookOptions+'</select>'+
    '</div></div>'+
    '<div class="f-chat-head-actions">'+
    '<button type="button" class="f-btn f-btn-new" data-action="new-chat">＋ Новый чат</button>'+
    '<details class="f-mobile-history"><summary aria-label="История разговоров">История</summary>'+
      mobileHistory+'</details>'+
    (c?'<details class="f-chat-more"><summary aria-label="Действия с чатом" title="Действия с чатом">···</summary>'+
      '<div class="f-chat-more-menu"><button type="button" data-action="rename-chat">Переименовать</button>'+
      '<button type="button" class="f-destructive" data-action="delete-chat">Удалить чат</button></div></details>':"")+
    '</div><div class="f-chat-source">'+
      '<span class="f-source-tag'+(p?.masterBookId?' linked':'')+'"><span aria-hidden="true"></span>'+source+'</span>'+
      (p?'<button type="button" class="f-project-open-link" data-action="project-home" data-id="'+esc(p.id)+'">Инструкции проекта ↗</button>':"")+
    '</div></div>'+
    '<div class="f-chat-body" id="f-messages" data-key="'+esc(draftKey())+'" role="log" aria-live="polite" aria-relevant="additions">'+
      (body||'<div class="f-chat-welcome"><span class="f-welcome-mark" aria-hidden="true"><img src="../workshop/bear.svg" alt="" width="55" height="55"></span>'+
        (p?'<h2>'+esc(p.name)+'</h2><p>Вставь задание на главу или фрагмент для правки.</p>':
           '<h2>Новый диалог</h2><p>Для работы над главой выбери книгу вверху.</p>')+'</div>')+
    '</div>'+
    (p?'<aside class="f-chat-context" aria-label="Контекст книги">'+
      '<h2>Контекст книги</h2><p class="f-context-book">'+esc(p.name)+'</p>'+
      '<h3>Рукопись</h3><p>'+(p.masterBookId?(p.manuscriptScope==="full"?'Канон и все главы снимка.':'Канон, главы перед текущей и отрывки по заданию.'):'Локальный проект')+'</p>'+
      '<h3>Инструкция проекта</h3><p>'+(userInstruction(p.instruction).trim()?'Сохранена и применяется в чатах книги.':'Пока пустая.')+'</p>'+
      '<button type="button" class="f-btn" data-action="project-home" data-id="'+esc(p.id)+'">Открыть проект ↗</button></aside>':"")+
    '<form id="f-chat-form" class="f-compose">'+
      '<div class="f-compose-surface"><div class="f-writing-bar">'+
      '<label class="f-compact-label" for="f-quick-model">Модель</label>'+
      '<select id="f-quick-model" class="f-select f-quick-model" aria-label="Модель для следующего ответа" '+(busy?"disabled":"")+'>'+modelChoices()+'</select>'+
      (p?'<span id="f-chapter-limit-wrap"><label class="f-compact-label" for="f-chapter-limit">Лимит главы</label>'+
      '<select class="f-select" id="f-chapter-limit" title="Верхняя граница ответа в токенах" '+(busy?"disabled":"")+'>'+chapterOptions+'</select></span>':
      '<label class="f-compact-label" for="f-writing-mode">Тип ответа</label>'+
      '<select class="f-select" id="f-writing-mode" '+(busy?"disabled":"")+'>'+modeOptions+'</select>')+
      (supportsEffort(state.settings.provider)?'<span id="f-effort-wrap" class="f-effort-choice" '+
        ((c?.mode||pendingMode||(p?"draft":"dialog"))==="draft"?"":"hidden")+'>'+
        '<label class="f-compact-label" for="f-chapter-effort">Рассуждения</label>'+
        '<select class="f-select" id="f-chapter-effort" '+(busy?"disabled":"")+'>'+effortOptions+'</select></span>':"")+
      '</div>'+
      '<label class="f-visually-hidden" for="f-message-input">Задание для модели</label>'+
      '<textarea class="f-textarea" id="f-message-input" rows="2" placeholder="'+(p?"Задание для главы или фрагмент текста…":"Что нужно сделать?")+'" '+(busy?"disabled":"")+'>\n'+esc(draft)+'</textarea>'+
      '<div class="f-compose-controls">'+
      '<div class="f-compose-actions">'+
      '<button type="button" class="f-inline-btn" data-action="expand-draft" '+(busy?"disabled":"")+'>Развернуть</button>'+
      '<span class="f-mini" id="f-draft-size">'+(draft?draft.length.toLocaleString("ru-RU")+' зн.':"")+'</span>'+
      '<details class="f-extra-tools" id="f-chat-tools" '+(toolsOpen?"open":"")+'><summary>Ещё</summary><div class="f-compose-menu">'+
      (p?.masterBookId && paidProviders.includes(state.settings.provider) && (c?.mode||pendingMode||"draft")==="draft"?
        '<label class="f-book-scope">Рукопись для глав<select id="f-book-scope" class="f-select" '+(busy?'disabled':'')+'>'+
        '<option value="auto">По заданию</option><option value="full" '+(p.manuscriptScope==="full"?'selected':'')+'>Вся рукопись</option></select></label>':"")+
      (canSearchBook?'<button type="button" data-action="search-book-context" '+(busy?"disabled":"")+'>Найти фразу в книге</button>':"")+
      (paidProviders.includes(state.settings.provider)?'<button type="button" data-action="preview-chapter" '+(busy?"disabled":"")+'>Контекст и цена</button>':"")+
      (paidProviders.includes(state.settings.provider)&&(c?.mode||pendingMode||(p?"draft":"dialog"))==="draft"?
        '<button type="button" data-action="send-background-chapter" '+(busy?"disabled":"")+'>Написать в фоне</button>':"")+
      '<button type="button" data-action="open-chapter-jobs">Фоновые главы</button>'+
      '<button type="button" data-action="export-context">Скопировать контекст</button>'+
      '<button type="button" data-action="paste-external">Добавить внешний ответ</button>'+
      '<button type="button" data-action="open-settings">Настройки модели</button>'+
      (p&&state.settings.provider==="bothub"&&activeBotHubModel()==="claude-opus-5.5"?
        '<button type="button" data-action="check-batch-availability">Проверить Batch бесплатно</button>'+
        (batchCheck===true?'<button type="button" data-action="send-batch-chapter">Отправить через Batch (платно)</button>':""):"")+
      '</div></details></div>'+
      (busy?'<button type="button" class="f-btn danger" data-action="stop">Остановить</button>':
            '<button type="submit" class="f-btn primary">Отправить <span aria-hidden="true">↗</span></button>')+
      '</div></div>'+
      (c?.batch?.batchId&&c.batch.status!=="completed"?
        '<div class="f-row"><span class="f-mini">Batch: '+esc(c.batch.status||"отправлен")+'</span>'+
        '<button type="button" class="f-btn" data-action="check-batch-chapter">Проверить готовность главы</button></div>':"")+
      (state.settings.provider==="bothub"&&activeBotHubModel()==="claude-opus-5.5"&&!c?.batch?.batchId&&c?.messages?.at(-1)?.role==="assistant"&&/HTTP 524|вернул 524/.test(c.messages.at(-1).content)&&p?
        '<div class="f-row"><button type="button" class="f-btn" data-action="retry-batch-chapter">Эту главу — через Batch API</button></div>':"")+
    '</form></section>';
  resizeChatInput($("#f-message-input"));
  const historyEl=$("#f-messages");
  if(scrollTop!==null)historyEl.scrollTop=scrollTop;
  else if(c?.messages?.length)historyEl.scrollTop=historyEl.scrollHeight;
}
function nearEnd(log){
  return log.scrollHeight-log.clientHeight-log.scrollTop<72;
}
// Keep the input one/two lines tall for ordinary prompts. Grow only when typed
// content needs it, and cap height so the reader's conversation stays visible.
function resizeChatInput(input){
  if(!input)return;
  input.style.height="auto";
  const cap=Math.max(44,Math.floor(window.innerHeight*(window.innerWidth<=760?.27:.34)));
  input.style.height=Math.min(input.scrollHeight,cap)+"px";
}
function ensureChat(){
  if(chat())return chat();
  const c={id:uid(),projectId:state.activeProjectId||null,title:"Новый чат",mode:pendingMode||(state.activeProjectId?"draft":"dialog"),messages:[],updated:stamp()};
  pendingMode=null;
  state.chats.unshift(c);state.activeChatId=c.id;save();return c;
}
function openModal(title,fields,preset={},saveLabel="Сохранить"){
  const dlg=document.createElement("dialog");dlg.className="f-dialog";
  dlg.innerHTML='<form id="f-dialog-form" method="dialog"><h2>'+esc(title)+'</h2>'+
    fields.map(f=>'<label for="f-field-'+esc(f.key)+'">'+esc(f.label)+'</label>'+
      (f.multi?'<textarea class="f-textarea" id="f-field-'+esc(f.key)+'" name="'+esc(f.key)+'">\n'+esc(preset[f.key]||"")+'</textarea>':
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
    p?{...p,instruction:userInstruction(p.instruction)}:{name:"",instruction:""});
  if(!v)return;
  const details={name:v.name.trim(),description:v.description.trim(),instruction:v.instruction,
    canon:v.canon||"",voice:v.voice||"",scene:v.scene||""};
  if(p)Object.assign(p,details);
  else{const q={id:uid(),...details};state.projects.unshift(q);state.activeProjectId=q.id;state.activeChatId=null;projectHomeId=q.id;}
  await save();render();
}
async function editMaterial(doc){
  const p=doc?project(doc.projectId):materialsProject();
  if(!p)return notice("Сначала выбери проект.");
  const v=await openModal(doc?"Изменить материал":"Новая заметка",
    [{key:"name",label:"Название",required:true},{key:"text",label:"Текст",multi:true,required:true}],doc);
  if(!v||!project(p.id))return;
  if(v.text.length>MAX_MATERIAL_LENGTH)return notice("В материале больше двух миллионов знаков.");
  const newDoc={...doc,id:doc?.id||uid(),projectId:p.id,name:v.name.trim(),text:v.text,added:doc?.added||stamp()};
  state.docs=doc?state.docs.map(d=>d.id===doc.id?newDoc:d):[newDoc,...state.docs];
  if(!await save()){
    state.docs=doc?state.docs.map(d=>d===newDoc?doc:d):state.docs.filter(d=>d!==newDoc);
    return;
  }
  render();notice("Материал сохранён.");
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
  const docs=state.docs.filter(d=>d.projectId===projectId&&d.includeInContext!==false);
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
function memoryForProject(p,c,task,recent,budget,docs=state.docs,onUse){
  const focused=chapterCues(task)||(task.length>3600?task.slice(0,2400)+"\n"+task.slice(-1200):task);
  const names=focused.match(/(?<![А-Яа-яЁё])[А-ЯЁ][а-яё]{2,}/gu)||[];
  const terms=[...new Set([...searchTerms(names.join(" ")).slice(-8),...searchTerms(focused.slice(-1200)).slice(-8),...searchTerms(focused.slice(0,2400)).slice(0,8)])];
  return projectMemoryContext({project:p,chats:state.chats,docs,feedback:state.feedback,
    current:c.id,recent,task,terms,budget,onUse});
}
function modelproxyMessages(c, manifest){
  // Claude Projects-style workflow: one editable instruction, an unchanged
  // full user request in every chapter chat and no injected style templates.
  const p=project(c.projectId);
  const messages=c.messages.filter(m=>(m.role==="user"||m.role==="assistant")&&typeof m.content==="string");
  const latest=messages.at(-1)?.content||"";
  let cues=p && c.mode==="draft" ? chapterCues(latest) : "";
  let projectInstructions=[
    userInstruction(state.settings.globalInstruction),
    userInstruction(p?.instruction),
    p?.voice?"Дополнительные инструкции автора о стиле:\n"+p.voice:"",
    p?.canon?"Дополнительные сведения автора:\n"+p.canon:"",
    p?.scene?"Заметки автора о текущей сцене:\n"+p.scene:""
  ].filter(Boolean).join("\n\n");
  if (cues) {
    const focus="Ориентиры из текущего задания автора:\n"+cues+
      "\nСверяй имена, улики, хронологию и знания героев с каноном и текстом сцен. Полное задание автора приведено в последнем сообщении.";
    const combined=[projectInstructions,focus].filter(Boolean).join("\n\n");
    if (combined.length<=130000 && combined.length+latest.length<=180000) projectInstructions=combined;
    else cues="";
  }
  // The original request, including an entire preceding chapter, stays intact.
  // No truncation, excerpt selection, automatic prompt rewriting or restart.
  // Any request that exceeds the gateway limit produces a visible error before
  // a paid provider call rather than silently dropping author material.
  // A retry after HTTP 524 must not bill the same 40k-character prompt twice
  // inside its own history. Keep the latest author request verbatim.
  const previous=messages.slice(0,-1)
    .filter(m=>!(m.role==="user"&&m.content===latest) && usableReply(m,c.id,state.feedback)).slice(-6);
  let remaining=p?Math.max(0,Math.min(14000,180000-projectInstructions.length-latest.length)):Infinity;
  const history=[];
  const marker="[Фрагмент из недавней переписки]\n";
  for(const message of previous.slice().reverse()){
    if(remaining<marker.length+100)break;
    const size=p?Math.min(5200,remaining):remaining;
    const content=message.content.length>size?marker+message.content.slice(-(size-marker.length)):message.content;
    history.unshift({role:message.role,content});
    remaining-=content.length;
  }
  const headroom=Math.min(130000-projectInstructions.length,
    180000-projectInstructions.length-latest.length-history.reduce((n,m)=>n+m.content.length,0));
  const memory=p?memoryForProject(p,c,latest,history.length?previous.slice(-history.length):[],Math.min(4000,headroom-2),state.docs,item=>{
    if(item.material)manifest?.materials.push(item.material);
    if(item.decision)manifest?.decisions.push(item.decision);
    if(item.kind==="map" && manifest)manifest.storyMap=true;
    if(item.kind==="style" && manifest)manifest.style=true;
    if(item.archiveChat)manifest?.chats.push(item.archiveChat);
  }):"";
  if(manifest){
    manifest.history=history.length;
    if(cues)manifest.cues=cues;
    manifest.rules=[state.settings.globalInstruction&&"общая",p?.instruction&&"проекта",p?.voice&&"стиль",p?.canon&&"канон автора",p?.scene&&"текущая сцена"].filter(Boolean);
  }
  const instructions=[projectInstructions,memory].filter(Boolean).join("\n\n");
  return [...(instructions?[{role:"system",content:instructions}]:[]),
    ...history,{role:"user",content:latest}];
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
  const eligible=c.messages.filter(m=>usableReply(m,c.id,state.feedback)).slice(-7);
  const history=eligible.map((m,i)=>({role:m.role,content:i===eligible.length-1?m.content:m.content.slice(-1800)}));
  const memory=p?memoryForProject(p,c,lastUser,history,Math.min(1250,Math.floor(budget.total*.32)),state.docs):"";
  const parts=[
    s.globalInstruction.slice(0,budget.global),
    "Режим «"+mode.name+"». "+mode.instruction,
    p?.instruction?"Инструкция проекта «"+p.name+"»: "+p.instruction.slice(0,budget.extra):"",
    p?.masterCanon?"УТВЕРЖДЁННАЯ ЛЕГЕНДА ИЗ МАСТЕРСКОЙ:\n"+pinnedExcerpt(p.masterCanon,lastUser,Math.round(budget.canon*.6)):"",
    p?.canon?"ДОПОЛНЕНИЯ АВТОРА К КАНОНУ:\n"+pinnedExcerpt(p.canon,lastUser,p.masterCanon?Math.round(budget.canon*.4):budget.canon):"",
    p?.voice?"Голос автора и ограничения:\n"+p.voice.slice(0,budget.voice):"",
    p?.scene?"ТЕКУЩАЯ СЦЕНА/ПОСЛЕДНИЕ СОБЫТИЯ:\n"+p.scene.slice(0,budget.scene):"",
    memory,
    "Выдержки не равны полной рукописи. Если данных недостаточно, скажи об этом.",
  ].filter(Boolean);
  let sys=parts.join("\n\n");
  if(sys.length>budget.total){
    // Сохраняем найденные выдержки: сначала сокращаем второстепенные
    // инструкции, затем хвост истории. При обычном бюджете лимит не достигается.
    sys=sys.slice(0,budget.total);
  }
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
const safeWorkerEndpoint=(value)=>{
  const endpoint=safeEndpoint(value);
  if(!endpoint)return null;
  const url=new URL(endpoint);
  if(url.protocol!=="https:" && !["localhost","127.0.0.1","[::1]"].includes(url.hostname))return null;
  return endpoint;
};
// BotHub keeps its Pages service binding. The separate gateway accepts only
// approved Freitag origins and validates the same Firebase owner token.
function claudeGateway(savedUrl,provider){
  const host=location.hostname.toLowerCase();
  if (host==="freitag-ai-test.pages.dev" ||
      /^[a-z0-9-]+\.freitag-ai-test\.pages\.dev$/.test(host))
    return paidProviders.includes(provider)&&provider!=="bothub"?
      "https://freitag-api-gateway.erichtho-xx.workers.dev":location.origin+"/api/freitag";
  return safeWorkerEndpoint(savedUrl);
}
async function probeLocalConnection(){
  if(paidProviders.includes(state.settings.provider)){
    connectOk=false;connectText=activeProviderLabel()+": проверь шлюз в настройках";
    renderHeader();return;
  }
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
  const chosen=$("#f-provider")?.value||state.settings.provider;
  if(paidProviders.includes(chosen)){
    const gateway=claudeGateway($("#f-worker")?.value||state.settings.workerUrl,chosen);
    if(!gateway)return notice("Укажи HTTPS-адрес личного Cloudflare Worker.");
    try{
      const response=await fetch(gateway+"/health",{cache:"no-store"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const data=await response.json();
      if(data.provider!=="ModelProxy"||data.model!=="claude-opus-5-5"||data.chapterProtocol!==2)
        throw Error("На сервере прежняя версия шлюза. Обнови Worker без платных запросов.");
      if(!data.ok || !(data.availableProviders?.[chosen] ?? data[chosen==="modelproxy"?"configured":chosen+"Configured"]))
        throw Error(providerNames[chosen]+": в Cloudflare нужен секрет "+chosen.toUpperCase()+"_API_KEY и настройка владельца.");
      let info;
      {
        const model=chosen==="modelproxy"?"claude-opus-5-5":chosen==="apimira"?"anthropic/claude-opus-5.5":($("#f-bothub-model")?.value||activeBotHubModel());
        const token=await master.idToken();
        const check=await fetch(gateway+"/preflight?provider="+chosen+"&model="+encodeURIComponent(model),{
          headers:{"Authorization":"Bearer "+token},cache:"no-store"
        });
        info=await check.json().catch(()=>({}));
        if(!check.ok||!info.ok)throw Error(info.error||info.message||"Модель недоступна.");
      }
      // Check the REAL MCP server, not the mere existence of a KV binding.
      const token=await master.idToken();
      const mcpRes=await fetch(claudeGateway(state.settings.workerUrl,"bothub")+"/mcp-tools",{
        headers:{"Authorization":"Bearer "+token},cache:"no-store"
      });
      const mcpInfo=await mcpRes.json().catch(()=>({}));
      if(!mcpRes.ok || !mcpInfo.ok)
        throw Error(mcpInfo.error||"Прямое MCP-подключение не работает.");
      connectOk=true;
      const sourceLabel="Коннектор Freitag";
      connectText=sourceLabel+" · "+activeProviderLabel();
      const status=$("#f-test-status");
      const money=chosen==="modelproxy"&&Number.isFinite(info?.balanceUsd)?" Баланс ModelProxy "+usd(info.balanceUsd)+".":chosen==="apimira"&&typeof info?.balanceUsd==="number"?
        " Баланс ApiMira "+usd(info.balanceUsd)+"."+
        (Number.isFinite(info.inputUsd)&&Number.isFinite(info.outputUsd)?
          " Тариф за 1 млн токенов: вход "+usd(info.inputUsd)+", выход "+usd(info.outputUsd)+".":""):"";
      const modelStatus=info?.chapterApi==="anthropic-messages"?"Ключ BotHub видит модель в Anthropic Messages. ":info?"Модель есть в каталоге. ":"";
      const sourceStatus="Общий коннектор Freitag · "+mcpInfo.toolCount+" инструментов чтения. ";
      if(status)status.textContent=modelStatus+sourceStatus+"Проверка бесплатна."+money;
      notice("Защищенный шлюз найден. Проверка бесплатна.");
    }catch(e){connectOk=false;connectText=e.message;const status=$("#f-test-status");
      if(status)status.textContent=e.message;notice("Claude: "+e.message);}
    renderHeader();return;
  }
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
// Платформенно-независимый экспорт контекста книги. Без отправки рукописей сторонним сервисам.
function buildExternalBrief(c){
  const p=project(c.projectId), mode=WRITING_MODES[c.mode]||WRITING_MODES.draft;
  const question=[...c.messages].reverse().find(m=>m.role==="user")?.content||"";
  const all=feedbackForContext(state.feedback,c.projectId);
  const good=all.filter(f=>f.kind==="good").slice(-3);
  const bad=all.filter(f=>f.kind==="bad").slice(-3);
  const memory=[
    ...good.map((f,i)=>"ОДОБРЕННЫЙ ПРИМЕР "+(i+1)+(f.reason?" — "+f.reason:"")+":\n"+String(f.finalText||f.answer).slice(0,2100)),
    ...bad.map((f,i)=>"НЕ ПОВТОРЯТЬ "+(i+1)+": "+(f.reason||"Автор отклонила фрагмент")+
      (f.finalText?"\nАвторский вариант: "+f.finalText.slice(0,1200):""))
  ].join("\n\n");
  const recent=c.messages.slice(0,-1).filter(m=>usableReply(m,c.id,state.feedback)).slice(-8).map(m=>(m.role==="assistant"?"ОТВЕТ":"АВТОР")+": "+String(m.content).slice(0,2200)).join("\n\n").slice(-9000);
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
function openExternalTransfer(prompt){
  document.querySelector("#f-external-modal")?.remove();
  const dlg=document.createElement("dialog");dlg.id="f-external-modal";dlg.className="f-dialog f-transfer-dialog";
  dlg.innerHTML='<div class="f-transfer"><h2>Контекст книги подготовлен</h2>'+
    '<p class="f-muted">Это не API-интеграция. Ничего не отправлено сторонним моделям. Ты сама выбираешь сервис и проверяешь правила использования его данных.</p>'+
    '<textarea class="f-textarea" id="f-external-brief" readonly aria-label="Подготовленный контекст">'+esc(prompt)+'</textarea>'+
    '<div class="f-row f-transfer-actions"><button class="f-btn primary" type="button" data-transfer="copy">Копировать задание</button>'+
    ''+
    '<button class="f-btn" type="button" data-transfer="close">Закрыть</button></div>'+
    '<p class="f-muted">Сохраняй ответы одобренной модели в рабочем чате, если хочешь собирать примеры для будущей собственной модели.</p></div>';
  document.body.appendChild(dlg);dlg.showModal();
  dlg.addEventListener("close",()=>dlg.remove(),{once:true});
  dlg.addEventListener("click",async e=>{
    const action=e.target.closest("[data-transfer]")?.dataset.transfer;
    if(action==="close"){dlg.close();return;}
    if(action==="copy"){
      const field=dlg.querySelector("#f-external-brief");
      try{await navigator.clipboard.writeText(field.value);notice("Контекст скопирован.");}
      catch{field.focus();field.select();notice("Нажми Ctrl+C, чтобы скопировать выделенный текст.");}
    }
  });
}
async function prepareExternal(text){
  if(busy||!text.trim())return;
  const c=ensureChat(),q=text.trim();
  c.messages.push({role:"user",content:q,at:stamp()});
  if(c.title==="Новый чат")c.title=q.slice(0,65);
  c.updated=stamp();
  const brief=buildExternalBrief(c);
  await save();render();openExternalTransfer(brief);
}
async function saveExternalAnswer(){
  const c=chat();if(!c)return notice("Сначала открой чат.");
  const v=await openModal("Сохранить ответ внешней модели",[{key:"text",label:"Вставь текст ответа",multi:true,required:true}]);
  if(!v?.text?.trim())return;
  c.messages.push({role:"assistant",content:v.text.trim().slice(0,160000),provider:"Внешняя модель",at:stamp()});
  c.updated=stamp();await save();render();notice("Внешний ответ сохранён в рабочем чате.");
}
async function saveFeedback(i,kind){
  const c=chat(),response=c?.messages[i];
  if(!c||response?.role!=="assistant")return;
  const rejection=rejectedReply(response,c.id,state.feedback);
  if(kind==="bad" && rejection){
    state.feedback=state.feedback.filter(f=>f.id!==rejection.id);
    await save();render();notice("Ответ снова доступен в этом диалоге.");return;
  }
  const title=kind==="good"?"Добавить в образцы":"Исключить ответ из контекста";
  const v=await openModal(title,[
    {key:"reason",label:kind==="good"?"Что в этом тексте удачно?":"Что исправить в следующий раз (необязательно)",multi:true,required:kind==="good"},
    {key:"finalText",label:"Твоя окончательная редакция (необязательно)",multi:true}
  ],{reason:"",finalText:kind==="good"?response.content.slice(0,10000):""});
  if(!v || (kind==="good" && !v.reason.trim()))return;
  const preceding=[...c.messages.slice(0,i)].reverse().find(m=>m.role==="user");
  state.feedback.push({id:uid(),projectId:c.projectId,chatId:c.id,messageAt:response.at,kind,reason:v.reason.trim().slice(0,1500),
    prompt:preceding?.content?.slice(0,10000)||"",answer:response.content.slice(0,18000),
    finalText:v.finalText.trim().slice(0,18000),source:response.provider||"Qwen",at:stamp()});
  await save();render();notice(kind==="good"?"Пример добавлен в память стиля.":"Ответ сохранён в чате и исключён из контекста.");
}
async function editProjectMemory(p,id,source){
  if(!p)return;
  const notes=Array.isArray(p.memoryNotes)?p.memoryNotes:[];
  const previous=notes.find(note=>note.id===id);
  if(id&&!previous)return;
  const values=await openModal(previous?"Уточнить решение":"Закрепить решение автора",[
    {key:"title",label:"Название",required:true},
    {key:"text",label:"Факт, открытая линия или правило для следующих глав",multi:true,required:true}
  ],previous||{title:source?.title||"",text:source?.content?.slice(0,1600)||""});
  if(!values||project(p.id)!==p)return;
  const title=values.title.trim(),text=values.text.trim();
  if(text.length>12000)return notice("Для записи в памяти используй до 12 000 знаков. Большой текст можно сохранить в материалах.");
  const anchor=previous?.anchor||source?.anchor;
  const note={id:previous?.id||uid(),title,text,updated:stamp(),...(anchor?{anchor}:{})};
  p.memoryNotes=[...notes.filter(item=>item.id!==note.id),note];
  await save();render();notice("Решение сохранено в памяти проекта.");
}

async function checkBatchAvailability(){
  if(busy||preparingPaid)return;
  const gateway=claudeGateway(state.settings.workerUrl);
  if(!gateway)return notice("Не настроен шлюз Freitag AI.");
  try{
    await master.init();
    if(!master.user)throw Error("Сначала войди в Мастерскую.");
    const token=await master.idToken();
    const response=await fetch(gateway+"/batch-models",{
      headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const result=await response.json().catch(()=>({}));
    batchCheck=!!(response.ok&&result.ok);
    notice(batchCheck?"Opus 5.5 есть в каталоге Batch. Проверка бесплатная, но она НЕ подтверждает разрешение на создание задачи.":
      "Batch Opus 5.5 недоступен: "+(result.error||result.message||"Неизвестная ошибка."));
  }catch(e){batchCheck=false;notice("Batch: "+e.message);}
  render();
}
async function sendBatchChapter(text){
  if(busy||preparingPaid||!text?.trim())return;
  const p=project();
  if(!p)return notice("Для Batch-главы выбери проект книги.");
  if(p.manuscriptScope==="full")return notice("Для всей рукописи используй «Отправить» или «Написать в фоне», чтобы сначала проверить стоимость.");
  if(isSimpleGreeting(text))return notice("Для Batch требуется задание на главу.");
  if(chat()?.batch?.batchId && !["completed","failed","cancelled","expired"].includes(chat().batch.status))
    return notice("В этом чате уже ожидается результат Batch. Проверь готовность главы.");
  if(state.settings.provider!=="bothub"||activeBotHubModel()!=="claude-opus-5.5")
    return notice("Batch-глава поддерживается для Claude Opus 5.5 через BotHub.");
  const outputLimit=chapterOutputLimit();
  if(!confirm("Отправить главу в BotHub как платную фоновую задачу? После принятия появится номер задачи. Окно выполнения — до 24 часов."))
    return;
  const gateway=claudeGateway(state.settings.workerUrl);
  if(!gateway)return notice("Не настроен шлюз Freitag AI.");
  busy=true;preparingPaid=true;
  const prevDraft=draftKey(),c=ensureChat(),msg=text;
  c.mode="draft";
  c.messages.push({role:"user",content:msg,at:stamp()});
  if(c.title==="Новый чат")c.title=msg.slice(0,65);
  const messages=modelproxyMessages(c);
  const assistant={role:"assistant",provider:"Claude Opus 5.5 · Batch",
    content:"Отправка главы в Batch API BotHub…",at:stamp()};
  const assistantIndex=c.messages.length;
  c.messages.push(assistant);c.updated=stamp();
  clearTimeout(draftSaveTimer);
  if(state.drafts){delete state.drafts[prevDraft];delete state.drafts[draftKey()];}
  await save();render();
  try{
    await master.init();
    if(!master.user)throw Error("Сначала войди в Мастерскую.");
    const token=await master.idToken();
    const headers={Authorization:"Bearer "+token};
    // Check Batch support before uploading anything (free).
    const ready=await fetch(gateway+"/batch-models",{headers,cache:"no-store"});
    const availability=await ready.json().catch(()=>({}));
    if(!ready.ok||!availability.ok)
      throw Error(availability.error||availability.message||
        "Batch недоступен по этому ключу или не опубликован в Worker. Генерация не запускалась.");
    const response=await fetch(gateway+"/batch-start",{
      method:"POST",headers:{...headers,"Content-Type":"application/json"},
      body:JSON.stringify({provider:"bothub",model:"claude-opus-5.5",
        mode:"draft",messages,bookId:p.masterBookId||null,manuscriptScope:"auto",
        outputTokenLimit:outputLimit})
    });
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok||!result.batchId)
      throw Error(result.error||"BotHub не подтвердил Batch. Не отправляй запрос снова вслепую.");
    c.batch={batchId:result.batchId,status:result.status||"submitted",
      assistantIndex,model:result.model,createdAt:stamp()};
    assistant.content="Глава отправлена через BotHub Batch API. ID: "+result.batchId+
      (result.reused?"\nРанее отправленная задача найдена — повторного запуска нет.":"")+
      "\nМожно закрыть вкладку: задача выполняется у провайдера. Вернись в этот чат и нажми «Проверить готовность главы».";
    notice("Batch принят. Проверка статуса не запускает новую платную генерацию.");
  }catch(e){assistant.content="Отправка Batch: "+e.message;notice(assistant.content);}
  finally{busy=false;preparingPaid=false;c.updated=stamp();await save();render();}
}
async function checkBatchChapter(){
  const c=chat(),job=c?.batch;
  if(!job?.batchId||busy)return;
  const gateway=claudeGateway(state.settings.workerUrl);
  if(!gateway)return notice("Не настроен шлюз Freitag AI.");
  busy=true;
  try{
    await master.init();
    const token=await master.idToken();
    const response=await fetch(gateway+"/batch-status?id="+encodeURIComponent(job.batchId),
      {headers:{Authorization:"Bearer "+token},cache:"no-store"});
    const result=await response.json().catch(()=>({}));
    if(!response.ok)throw Error(result.error||"Статус Batch недоступен.");
    job.status=result.status||"unknown";
    const assistant=c.messages[job.assistantIndex];
    if(!assistant)throw Error("Ответ Batch не найден в этом чате.");
    if(job.status==="completed"&&result.ok&&typeof result.content==="string"){
      assistant.content=result.content;
      if(result.finishReason!=="stop")
        assistant.content+=result.finishReason==="length"?"\n\n[Достигнут лимит ответа: глава может быть неполной.]":
          "\n\n[Провайдер не подтвердил завершение главы. Полученный текст сохранен.]";
      job.usage=result.usage||null;
      Object.assign(assistant,{apiProvider:"bothub",apiAccepted:true,apiUsage:job.usage,apiRequestId:result.requestId||job.batchId});
      rememberExpense(assistant,c);
      notice("Текст из BotHub Batch сохранен в чате.");
    }else if(result.ok===false||["failed","cancelled","expired"].includes(job.status)){
      assistant.content="BotHub Batch завершился без главы: "+(result.error||job.status)+
        ". Не отправляй дубликат автоматически.";
    }else{
      assistant.content="Глава обрабатывается через BotHub Batch. Статус: "+job.status+
        ". Нажми «Проверить готовность главы» позже.";
      notice("Batch: "+job.status);
    }
  }catch(e){notice("Batch: "+e.message);}
  finally{busy=false;c.updated=stamp();await save();render();}
}
function rememberExpense(message,c){
  const row=expenseFromMessage(message,c,project(c.projectId)?.name,c.messages.indexOf(message));
  if(row)state.expenses=mergeExpenses(state.expenses,[row]);
}
function receiptAmounts(provider,info){
  const values=provider==="apimira"?{USD:info.costUsd}:{RUB:info.costRub,CAPS:info.costCaps};
  return Object.fromEntries(Object.entries(values).filter(([,value])=>Number.isFinite(value)&&value>=0));
}
function applyMessageReceipt(message,provider,info,charges){
  if(provider==="apimira"){
    message.apimiraCostUsd=charges.USD;
    if(Number.isSafeInteger(info.inputTokens)&&Number.isSafeInteger(info.outputTokens))
      message.apimiraTokens={input:info.inputTokens,output:info.outputTokens,
        ...(Number.isSafeInteger(info.cachedTokens)?{cached:info.cachedTokens}:{})};
  }else{
    if(Number.isFinite(charges.RUB))message.bothubCostRub=charges.RUB;
    if(Number.isFinite(charges.CAPS))message.bothubCostCaps=charges.CAPS;
  }
}
function fetchReceipt(provider,ids,gateway,token){
  const [id,also]=ids;
  const params=new URLSearchParams({id,...(also&&also!==id?{also}:{})});
  return readOwnerJson(gateway,"/receipt?"+params,token);
}
async function readMessageReceipt(message,c,provider,ids,gateway,token){
  const snapshot=state;
  const info=await fetchReceipt(provider,ids,gateway,token);
  const charges=receiptAmounts(provider,info);
  if(!Object.keys(charges).length||snapshot!==state)return false;
  applyMessageReceipt(message,provider,info,charges);
  rememberExpense(message,c);
  await save();
  if(!busy&&!preparingPaid)render();
  return true;
}
const readApimiraReceipt=(message,c,gateway,token)=>
  readMessageReceipt(message,c,"apimira",[message.apimiraRequestId,message.providerRequestId].filter(Boolean),gateway,token);
function apiUsageLabel(usage,id,charged){
  const parts=[];
  if(Number.isFinite(usage.prompt_tokens))parts.push(usage.prompt_tokens.toLocaleString("ru-RU")+" токенов на входе");
  if(Number.isFinite(usage.completion_tokens))parts.push(usage.completion_tokens.toLocaleString("ru-RU")+" на выходе");
  if(!charged)parts.push("Сумма появится в «Тратах» после сверки");
  if(id&&!charged)parts.push("Запрос "+id);
  return parts.join(" · ");
}

async function readOwnerJson(gateway,path,idToken){
  if(!gateway)throw Error("Открой рабочую Freitag AI для доступа к Мастерской.");
  const res=await fetch(gateway+path,{headers:{Authorization:"Bearer "+idToken},cache:"no-store",signal:AbortSignal.timeout(18000)});
  const data=await res.json().catch(()=>({}));
  if(!res.ok||!data.ok)throw Error(data.error||"Шлюз не ответил. Попробуй обновить список.");
  return data;
}

const readBothubReceipt=(message,c,gateway,token)=>
  readMessageReceipt(message,c,"bothub",[message.apiRequestId,message.providerRequestId].filter(Boolean),gateway,token);

function expensesFromJobs(jobs){
  return jobs.map(job=>{
    const c=chat(job.chatId)||{id:job.chatId,projectId:job.projectId,title:"Фоновая глава"};
    return expenseFromMessage({role:"assistant",jobId:job.id,apiProvider:job.provider,
      provider:job.model,apiRequestId:job.requestId,providerRequestId:job.providerRequestId,apiUsage:job.usage,at:job.createdAt,
      costRub:job.provider==="aitunnel"?job.usage?.cost_rub:undefined},c,project(c.projectId)?.name||job.projectName,0);
  }).filter(Boolean);
}
async function recentReceipts(provider,token){
  const gateway=claudeGateway(state.settings.workerUrl,provider);
  const rows=[];
  const progress=billingCursor.get(provider)||{};
  let cursor=progress.next, newest=progress.newest;
  const cutoff=Date.now()-90*86400000;
  for (let index=0,page=0;index<4;index++) {
    const batch=await readOwnerJson(gateway,"/billing-history?page="+page,token);
    if(!Array.isArray(batch.rows))throw Error("Провайдер вернул неполную историю.");
    const seenHead=page===0 && cursor===null && progress.newest && batch.rows.some(row=>row.id===progress.newest);
    if(page===0 && batch.rows.length)newest=batch.rows[0].id;
    for(const row of batch.rows) if(row.provider===provider && row.requestIds?.length)
      rows.push({...row,unlinked:true});
    if(!Number.isSafeInteger(batch.nextPage) || batch.nextPage<=page ||
        (batch.rows.length && batch.rows.every(row=>Date.parse(row.at)<cutoff)) || seenHead){
      cursor=null;break;
    }
    page=index===0 && cursor>batch.nextPage ? cursor : batch.nextPage;
    cursor=page;
  }
  billingCursor.set(provider,{next:cursor,newest});
  return rows;
}
function assignReceiptsToChats(rows){
  const byId=new Map();
  for(const row of rows){
    if(row.unlinked || !row.requestIds?.length || !Object.keys(row.charges||{}).length)continue;
    for(const id of row.requestIds)byId.set(row.provider+":"+id,row);
  }
  for(const c of state.chats)for(const m of c.messages||[]){
    const row=[m.apiRequestId,m.apimiraRequestId,m.providerRequestId].map(id=>byId.get((m.apiProvider||(m.apimiraRequestId?"apimira":"bothub"))+":"+id)).find(Boolean);
    if(row)applyMessageReceipt(m,row.provider,{inputTokens:row.inputTokens,outputTokens:row.outputTokens,cachedTokens:row.cachedTokens},row.charges);
  }
}
async function refreshExpenses(id,automatic=false){
  if(refreshingExpenses || (automatic && (!master.user || document.hidden || Date.now()-lastBillingSync<60000)))return;
  const snapshot=state;
  refreshingExpenses=true;
  if(tab==="expenses")renderExpenses();
  try{
    const token=await master.idToken();
    lastBillingSync=Date.now();
    const errors=[];
    if(!id){
      const [jobs,...feeds]=await Promise.allSettled([backgroundSummaries(token),...billingProviders.map(p=>recentReceipts(p,token))]);
      if(snapshot!==state)return;
      const updates=jobs.status==="fulfilled"?expensesFromJobs(jobs.value.jobs):[];
      feeds.forEach((feed,i)=>{
        if(feed.status==="fulfilled")updates.push(...feed.value);
        else errors.push(providerNames[billingProviders[i]]);
      });
      state.expenses=mergeExpenses(state.expenses,updates);
    }
    const pending=state.expenses.filter(row=>canReconcileExpense(row) && (!id||row.id===id) &&
      (!automatic || !row.checkedAt || Date.now()-Date.parse(row.checkedAt)>15*60000))
      .sort((a,b)=>String(a.checkedAt||"").localeCompare(String(b.checkedAt||""))).slice(0,8);
    const receipts=await Promise.all(pending.map(async row=>{
      try{
        const info=await fetchReceipt(row.provider,row.requestIds,claudeGateway(state.settings.workerUrl,row.provider),token);
        return {...row,checkedAt:stamp(),charges:receiptAmounts(row.provider,info),
          inputTokens:info.inputTokens??row.inputTokens,outputTokens:info.outputTokens??row.outputTokens};
      }catch{errors.push(providerNames[row.provider]);return {...row,checkedAt:stamp()};}
    }));
    if(snapshot!==state)return;
    state.expenses=mergeExpenses(state.expenses,receipts);
    assignReceiptsToChats(state.expenses);
    billingIssue=errors.length?"Пока недоступна сверка с "+[...new Set(errors)].join(", ")+". Freitag повторит её автоматически.":"";
    await save();
    if(!automatic)notice(billingIssue||"Сверка завершена.");
  }catch(err){billingIssue=err.message;if(!automatic)notice(billingIssue);}
  finally{refreshingExpenses=false;if(tab==="expenses")renderExpenses();}
}

async function saveBackgroundChapter(job, item){
  if(busy||preparingPaid)return notice("Дождись завершения текущей операции.");
  if(!job.text)return false;
  let p=project(job.projectId)||state.projects.find(entry=>job.bookId&&entry.masterBookId===job.bookId);
  if(!p&&job.projectId){
    p={id:job.projectId,name:job.projectName||"Проект",instruction:"",canon:"",voice:"",scene:"",
      ...(job.bookId?{masterBookId:job.bookId}:{})};
    state.projects.unshift(p);
  }
  let c=chat(job.chatId);
  if(!c){
    c={id:job.chatId,projectId:p?.id||null,title:job.prompt.slice(0,65)||"Фоновая глава",mode:"draft",messages:[]};
    state.chats.unshift(c);
  }
  if(!c.messages.some(m=>m.role==="user"&&m.jobId===job.id)){
    const user={role:"user",content:job.prompt,jobId:job.id,at:job.createdAt};
    if(job.source)user.contextReceipt={bookOnly:true,book:bookReceipt(job.source),taskChars:job.prompt.length,
      rules:[],sources:[],materials:[],decisions:[],chats:[]};
    c.messages.push(user);
  }
  let message=c.messages.find(m=>m.role==="assistant"&&m.jobId===job.id);
  if(!message){message={role:"assistant",jobId:job.id,at:job.createdAt};c.messages.push(message);}
  Object.assign(message,{content:job.text,provider:"Claude · "+(providerNames[job.provider]||"API"),
    apiProvider:job.provider,
    receiving:job.status==="running"||job.status==="queued",
    incomplete:job.status!=="completed"||job.finishReason!=="stop",jobError:job.error||"",
    delivery:draftDelivery(job.prompt,job.text,job.finishReason||"",job.limit)});
  if(job.usage)message.apiUsage=job.usage;
  if(job.provider==="aitunnel"&&Number.isFinite(job.usage?.cost_rub))message.costRub=job.usage.cost_rub;
  if(job.requestId)message.apiRequestId=job.requestId;
  if(job.providerRequestId)message.providerRequestId=job.providerRequestId;
  if(job.provider==="apimira"&&job.requestId)message.apimiraRequestId=job.requestId;
  c.updated=stamp();state.activeProjectId=c.projectId;state.activeChatId=c.id;tab="chat";
  rememberExpense(message,c);
  if(!await save())return false;
  render();notice(message.receiving?"Фрагмент сохранён в чате.":"Глава сохранена в чате.");
  if(message.apimiraRequestId)void master.idToken().then(token=>readApimiraReceipt(message,c,item.gateway,token)).catch(()=>{});
  if(job.provider==="bothub"&&job.requestId)void master.idToken().then(token=>readBothubReceipt(message,c,item.gateway,token)).catch(()=>{});
  return true;
}

async function backgroundSummaries(token){
  const gateways=[...new Set([claudeGateway(state.settings.workerUrl,"bothub"),claudeGateway(state.settings.workerUrl,"apimira")].filter(Boolean))];
  const responses=await Promise.allSettled(gateways.map(gateway=>readOwnerJson(gateway,"/chapter-jobs",token)
    .then(data=>data.jobs.map(job=>({...job,gateway})))));
  const jobs=responses.flatMap(result=>result.status==="fulfilled"?result.value:[])
    .sort((a,b)=>String(b.createdAt).localeCompare(String(a.createdAt)));
  if(!responses.some(r=>r.status==="fulfilled"))throw Error(responses[0]?.reason?.message||"Фоновые главы недоступны.");
  return {jobs,unavailable:responses.some(r=>r.status==="rejected")};
}
function showBackgroundChapters(){
  openChapterJobs({
    list:async()=>{
      const report=await backgroundSummaries(await master.idToken());
      state.expenses=mergeExpenses(state.expenses,expensesFromJobs(report.jobs));
      if(report.jobs.length)await save();
      return report;
    },
    read:async item=>(await readOwnerJson(item.gateway,"/chapter-jobs?id="+encodeURIComponent(item.id),await master.idToken())).job,
    save:saveBackgroundChapter
  });
}

async function submitBackgroundChapter(payload,gateway,idToken,previousDraft,estimate,userMessage){
  preparingPaid=true;
  const c=ensureChat(),p=project(c.projectId);
  try{
    const pending=state.chapterSubmission;
    const reused=pending?.chatId===c.id&&pending?.fingerprint===estimate.fingerprint&&pending?.provider===payload.provider;
    const id=reused?pending.id:uid();
    state.chapterSubmission={id,chatId:c.id,fingerprint:estimate.fingerprint,provider:payload.provider};
    state.drafts??={};state.drafts[draftKey()]=userMessage.content;
    if(!await save())return;
    const res=await fetch(gateway+"/chapter-jobs",{method:"POST",headers:{Authorization:"Bearer "+idToken,
      "Content-Type":"application/json"},body:JSON.stringify({...payload,job:{id,chatId:c.id,
      projectId:c.projectId,projectName:p?.name||""}})});
    const result=await res.json().catch(()=>({}));
    if(!res.ok||!result.ok)throw Error(result.error||"Проверь, появилось ли задание в «Фоновых главах».");
    if(!c.messages.some(m=>m.jobId===id))c.messages.push({...userMessage,jobId:id});
    if(c.title==="Новый чат")c.title=userMessage.content.slice(0,65);
    const row=expenseFromMessage({role:"assistant",apiProvider:payload.provider,provider:activeProviderLabel(),jobId:id,
      at:result.job?.createdAt||userMessage.at,costEstimate:savedEstimate(estimate)},c,p?.name,0);
    if(row)state.expenses=mergeExpenses(state.expenses,[row]);
    c.updated=stamp();
    delete state.chapterSubmission;
    clearTimeout(draftSaveTimer);
    delete state.drafts[previousDraft];delete state.drafts["chat:"+c.id];
    await save();render();notice("Глава принята. Её можно открыть в «Фоновых главах».");
    showBackgroundChapters();
  }catch(error){notice(error.message||"Проверь список фоновых глав.");}
  finally{preparingPaid=false;}
}

async function sendMessage(text,{previewOnly=false,background=false}={}){
  if(busy||preparingPaid||!text.trim())return;
  const provider=state.settings.provider, selectedModel=activeBotHubModel();
  const outputLimit=chapterOutputLimit();
  const effort=chapterEffort();
  const isPaidProvider=paidProviders.includes(provider);
  const endpoint=safeEndpoint(state.settings.endpoint);
  const gateway=claudeGateway(state.settings.workerUrl,provider);
  if(isPaidProvider&&!gateway)return notice("Не настроен API-шлюз Claude.");
  if(!isPaidProvider&&!endpoint)return notice("Проверь адрес Ollama в настройках.");
  let idToken="",sourceRevision="";
  if(isPaidProvider){
    const selectedChat=draftKey();
    preparingPaid=true;
    try {
      // Firebase session persists in the browser. This is silent, unlike
      // Google Drive OAuth: no repeated popups, book-upload or consent dialog.
      await master.init();
      if(!master.user)throw Error("Один раз войди в Мастерскую в разделе «Книги». Затем книги доступны через MCP без повторных входов.");
      idToken=await master.idToken();
      if(selectedChat!==draftKey() || provider!==state.settings.provider || selectedModel!==activeBotHubModel() ||
        outputLimit!==chapterOutputLimit() || effort!==chapterEffort())
        return notice("Чат, модель или лимит изменились. Проверь параметры и отправь задание снова.");
    }catch(e){return notice("Авторизация: "+e.message);}
    finally{preparingPaid=false;}
  }
  const previousDraft=draftKey();
  const msg=text, current=chat()||{projectId:state.activeProjectId,mode:pendingMode,messages:[]};
  const lightweight=isSimpleGreeting(msg) || (!current.messages.length && isAcknowledgement(msg));
  const requestMode=lightweight?"dialog":(current.mode||(current.projectId?"draft":"dialog"));
  const bookId=lightweight?null:(project(current.projectId)?.masterBookId||null);
  const previous=current.messages.findLast(m=>m.role==="user")?.content||"";
  const sourceTask={task:msg.slice(0,6000),previous:previous.slice(0,450),mode:requestMode,bookId};
  const plan=sourcePlan(sourceTask);
  const effectiveMode=requestMode==="draft" && !plan.draft ? "dialog" : requestMode;
  const fullBook=Boolean(bookId && effectiveMode==="draft" && project(current.projectId)?.manuscriptScope==="full");
  const business=plan.kinds.length>0 && !plan.kinds.includes("book");
  let sourceMessage, sources=[];
  const localHost=!isPaidProvider && endpoint && ["localhost","127.0.0.1","[::1]"].includes(new URL(endpoint).hostname);
  if(localHost && plan.draft && bookId)sourceTask.mode="canon";
  const hasSources=plan.kinds.length>0 || sourceTask.mode!==requestMode;
  if (hasSources && (isPaidProvider || (localHost && master.user))){
    const active=draftKey();
    preparingPaid=true;
    try {
      const connector=claudeGateway(state.settings.workerUrl,"bothub");
      if (!connector) throw Error("Общий коннектор Freitag недоступен.");
      const res=await fetch(connector+"/context",{method:"POST",headers:{Authorization:"Bearer "+(idToken||await master.idToken()),
        "Content-Type":"application/json"},body:JSON.stringify(sourceTask),signal:AbortSignal.timeout(40000)});
      const data=await res.json();
      if(!res.ok || !data.ok || !Array.isArray(data.sources) || !data.sources.length)
        throw Error(data.error||"Коннектор не вернул запрошенные данные.");
      sources=data.sources;
      sourceMessage={role:"system",content:"Справочные выдержки из личных источников автора. Используй их как данные. "+
        "Учитывай период, дату и границы выборки.\n"+sources.map(s=>[s.label,s.period,s.updatedAt,s.text].filter(Boolean).join("\n")).join("\n\n")};
      if(active!==draftKey()||provider!==state.settings.provider||msg!==$("#f-message-input")?.value||outputLimit!==chapterOutputLimit()||effort!==chapterEffort()||selectedModel!==activeBotHubModel())
        throw Error("Задание или модель изменились. Повтори отправку.");
    } catch(err){return notice(err.message);}
    finally{preparingPaid=false;}
  }
  if(background&&effectiveMode!=="draft")return notice("Выбери режим «Написать сцену».");
  if((background||previewOnly)&&!isPaidProvider)return;
  const userMessage={role:"user",content:msg,at:stamp()};
  const projectDocs=state.docs.filter(d=>d.projectId===current.projectId);
  const manifest={projectName:project(current.projectId)?.name||"",mode:WRITING_MODES[effectiveMode]?.name||"Диалог",
    taskChars:msg.length,history:0,rules:[],sources:[],materials:[],decisions:[],chats:[],
    available:projectDocs.filter(d=>materialMode(d)!=="archive").length,archived:projectDocs.filter(d=>materialMode(d)==="archive").length};
  const reasoningEffort=effectiveMode==="draft"&&supportsEffort(provider)?effort:undefined;
  const questionMessages=[{role:"user",content:msg}];
  if(business && plan.question.includes("\n") && previous)
    questionMessages.unshift({role:"user",content:previous.slice(0,450)});
  const payload=isPaidProvider?{provider,model:provider==="bothub"?selectedModel:undefined,
    messages:lightweight||business?questionMessages:modelproxyMessages({...current,mode:effectiveMode,messages:[...current.messages,userMessage]},manifest),
    mode:effectiveMode,outputTokenLimit:effectiveMode==="draft"?outputLimit:undefined,reasoningEffort,bookId,sourceRevision,
    ...(bookId && effectiveMode==="draft"?{manuscriptScope:fullBook?"full":"auto"}:{}),freitagContext:true}:null;
  if(business)manifest.history=questionMessages.length-1;
  if(payload && sourceMessage) payload.messages.unshift(sourceMessage);
  manifest.sources=sources.map(s=>({label:s.label,period:s.period||"",updatedAt:s.updatedAt||""}));
  let estimate;
  if(isPaidProvider){
    const isMira=provider==="apimira", label=providerNames[provider];
    preparingPaid=true;
    const selectedChat=draftKey();
    const draftBeforeQuote=$("#f-message-input")?.value;
    const modeBeforeQuote=$("#f-writing-mode")?.value;
    const progress=label+" · считаю стоимость без генерации…";
    notice(progress);
    try{
      const res=await fetch(gateway+"/quote",{method:"POST",headers:{Authorization:"Bearer "+idToken,
        "Content-Type":"application/json"},body:JSON.stringify(payload)});
      estimate=await res.json().catch(()=>({}));
      if(!res.ok||!estimate.ok)throw Error(estimate.error||"Не удалось получить бесплатную оценку.");
      if(fullBook && estimate.source?.scope!=="full")throw Error("Шлюз ещё не подтвердил всю рукопись. Обнови Freitag и повтори оценку.");
      if(selectedChat!==draftKey()||provider!==state.settings.provider||outputLimit!==chapterOutputLimit()||effort!==chapterEffort()||
        draftBeforeQuote!==$("#f-message-input")?.value||modeBeforeQuote!==$("#f-writing-mode")?.value)
        return notice("Задание или настройки изменились. Получи новую оценку.");
      const recent=state.expenses.filter(row=>row.provider===provider&&row.projectId===(current.projectId||"")&&
        Object.keys(row.charges||{}).length).sort((a,b)=>String(b.at).localeCompare(String(a.at)))[0];
      const flash=$("#f-flash");
      if(flash?.textContent===progress)flash.hidden=true;
      manifest.book=bookReceipt(estimate.source);
      userMessage.contextReceipt=manifest;
      const confirmed=await openRequestEstimate({estimate,model:activeProviderLabel(),memory:manifest,
        effort:effortLabels[reasoningEffort],recent,previewOnly,background,
        toolCalls:false});
      if(!confirmed)return;
      if(isMira)payload.apimiraQuote={fingerprint:estimate.fingerprint,estimateUsd:estimate.estimateUsd};
      else payload.contextQuote=estimate.fingerprint;
    }catch(e){return notice(e.message);}
    finally{preparingPaid=false;}
  }
  if(background)return submitBackgroundChapter(payload,gateway,idToken,previousDraft,estimate,userMessage);
  clearTimeout(draftSaveTimer);
  const c=ensureChat();
  if(c.projectId && !c.mode) c.mode="draft";
  if(state.drafts){
    delete state.drafts[previousDraft];
    delete state.drafts[draftKey()];
  }
  c.messages.push(userMessage);
  if(c.title==="Новый чат")c.title=msg.slice(0,65);
  c.updated=stamp();
  // Block a second Send while IndexedDB persists the first request.
  busy=true;
  const messages=isPaidProvider?payload.messages:business?[{role:"user",content:msg}]:buildMessages(c);
  if(!isPaidProvider && sourceMessage){
    const max=Math.max(700,Math.min(6000,(Number(state.settings.context)||4096)-700));
    messages.unshift({...sourceMessage,content:sourceMessage.content.length<=max?sourceMessage.content:
      sourceMessage.content.slice(0,max)+"\n[Выдержка сокращена для локальной модели]"});
  }
  const assistant={role:"assistant",provider:isPaidProvider?(provider==="bothub"?activeClaudeName():"Claude Opus 5.5"):"Qwen",
    ...(isPaidProvider?{apiProvider:provider,expenseId:uid(),costEstimate:savedEstimate(estimate)}:{}),content:"",at:stamp()};
  await save();render();
  c.messages.push(assistant);
  const el=document.createElement("div");el.className="f-msg assistant";
  el.innerHTML='<span class="f-speaker">'+(isPaidProvider?esc(assistant.provider):"Freitag AI")+'</span><div class="f-msg-text streaming pending">Генерация ответа…</div>';
  const log=$("#f-messages"),follow=log&&nearEnd(log);
  log?.append(el);
  if(follow)log.scrollTop=log.scrollHeight;
  const target=el.querySelector(".f-msg-text");
  currentController=new AbortController();
  let checkpointTimer=null,firstFragment=true;
  if(isPaidProvider)assistant.receiving=true;
  try{
    const res=isPaidProvider?await fetch(gateway+"/chat",{
      method:"POST",
      headers:{"Authorization":"Bearer "+idToken,"Content-Type":"application/json"},
      body:JSON.stringify(payload),
      signal:currentController.signal
    }):await ollamaRequest(endpoint,"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:state.settings.model,stream:true,messages,think:false,keep_alive:"5m",
        options:{num_ctx:Number(state.settings.context)||4096,num_predict:(WRITING_MODES[c.mode]||WRITING_MODES.dialog).maxTokens}}),
      signal:currentController.signal});
    if(!res.ok){
      const error=await res.json().catch(()=>null);
      if(isPaidProvider && error?.requestId){
        assistant.apiRequestId=error.requestId;
        if(provider==="apimira")assistant.apimiraRequestId=error.requestId;
      }
      if(res.status===424&&error?.code==="BOOK_SOURCE"){
        c.messages.splice(c.messages.indexOf(userMessage),2);
        if(chat(c.id)===c)state.drafts["chat:"+c.id]=msg;
        notice(error.error||"Мастерская не предоставила материал для главы.");
        return;
      }
      throw Error(typeof error?.error==="string"?error.error:"Сервер вернул HTTP "+res.status+".");
    }
    if(!res.body)throw Error("Сервер не вернул поток ответа");
    if(isPaidProvider)assistant.apiAccepted=true;
    const requestId=res.headers.get("X-Freitag-Request-Id");
    if(requestId){assistant.apiRequestId=requestId;if(provider==="apimira")assistant.apimiraRequestId=requestId;}
    if(isPaidProvider){rememberExpense(assistant,c);void save();}
    const reader=res.body.getReader(),decoder=new TextDecoder();let pending="",streamFinished=false,finishReason="";
    const consume=(line)=>{
      if(!line.trim())return;
      if(isPaidProvider){
        if(!line.startsWith("data:"))return;
        const data=line.slice(5).trim();
        if(data==="[DONE]"){streamFinished=true;return true;}
        let obj;try{obj=JSON.parse(data);}catch{throw Error("Поток содержит поврежденный фрагмент.");}
        if(obj?.error)throw Error("Провайдер сообщил об ошибке в потоке. Проверь историю запроса.");
        if(isPaidProvider){
          const eventId=obj?.request_id||obj?.id;
          if(typeof eventId==="string" && /^[a-z0-9_-]{1,100}$/i.test(eventId)) {
            assistant.providerRequestId=eventId;
            if(provider==="apimira"&&!assistant.apimiraRequestId)assistant.apimiraRequestId=eventId;
          }
        }
      if(Number.isFinite(obj?.usage?.prompt_tokens)||Number.isFinite(obj?.usage?.completion_tokens))
        assistant.apiUsage=Object.fromEntries(["prompt_tokens","completion_tokens"].filter(k=>Number.isFinite(obj.usage[k])).map(k=>[k,obj.usage[k]]));
        if(!obj || !Array.isArray(obj.choices))throw Error("Провайдер вернул неизвестный формат потока.");
        const reason=obj.choices?.[0]?.finish_reason;
        if(reason){finishReason=String(reason);streamFinished=true;}
        const fragment=obj.choices?.[0]?.delta?.content;
        if(typeof fragment==="string")assistant.content+=fragment;
        else if(Array.isArray(fragment))assistant.content+=fragment.map(x=>x.text||"").join("");
      }else{
        let obj;try{obj=JSON.parse(line);}catch{return;}
        if(obj.error)throw Error(obj.error);
        if(obj.message?.content)assistant.content+=obj.message.content;
      }
      if(assistant.content){
        const follow=log&&nearEnd(log);
        target.classList.remove("pending");target.textContent=assistant.content;
        if(follow)log.scrollTop=log.scrollHeight;
        // Persist long chapters during streaming; closing the tab must not erase paid text.
        if(firstFragment){firstFragment=false;void save();}
        else if(checkpointTimer===null)checkpointTimer=setTimeout(()=>{checkpointTimer=null;void save();},1000);
      }
    };
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      pending+=decoder.decode(value,{stream:true});
      const lines=pending.split("\n");
      pending=lines.pop();
      if(lines.some(line=>consume(line.trimEnd())===true)){
        pending="";void reader.cancel().catch(()=>{});break;
      }
    }
    pending+=decoder.decode();
    if(pending.trim())consume(pending.trimEnd());
    if(!assistant.content)throw Error("Модель не вернула текст. Проверь баланс и лимиты у провайдера.");
    if(isPaidProvider&&effectiveMode==="draft")assistant.delivery=draftDelivery(msg,assistant.content,finishReason,outputLimit);
    if(isPaidProvider&&(!streamFinished||(finishReason&&finishReason!=="stop"))){
      assistant.incomplete=true;
      // Preserve the paid partial chapter rather than pretending that a broken
      // stream or max_tokens cutoff is a complete manuscript.
      assistant.content+="\n\n[Генерация не завершена: "+(finishReason==="length"?"достигнут лимит длины ответа.":finishReason?"провайдер остановил выдачу.":"поток прервался до подтверждения завершения.")+" Уже полученный текст сохранен. Не отправляй запрос повторно автоматически.]";
    }
    connectOk=true;connectText=isPaidProvider?activeProviderLabel()+" подключен":"Ollama доступна";
  }catch(e){
    currentController.abort();
    assistant.noText=!assistant.content;
    assistant.incomplete=true;
    const prefix=e.name==="AbortError"?"Ответ остановлен.":(isPaidProvider?"Ошибка Claude: ":"Ошибка Ollama: ")+e.message;
    assistant.content=assistant.content?(assistant.content+"\n\n["+prefix+"]"):prefix;
    target.textContent=assistant.content;target.classList.remove("pending");
    connectOk=false;connectText=isPaidProvider?"Ошибка Claude":"Нет соединения";
  }finally{
    clearTimeout(checkpointTimer);delete assistant.receiving;
    rememberExpense(assistant,c);
    busy=false;currentController=null;c.updated=stamp();await save();render();
    if(assistant.apimiraRequestId)void readApimiraReceipt(assistant,c,gateway,idToken).catch(()=>{});
    if(provider==="bothub"&&(assistant.apiRequestId||assistant.providerRequestId))
      void readBothubReceipt(assistant,c,gateway,idToken).catch(()=>{});
  }
}
const handoff=projectAccessClient({master,gateway:()=>claudeGateway(state.settings.workerUrl,"bothub"),
  getState:()=>state,notify:notice,isBusy:()=>busy||preparingPaid,download});

function download(name,content,type="application/json;charset=utf-8"){
  const blob=new Blob([content],{type}),url=URL.createObjectURL(blob);
  const a=document.createElement("a");a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),3000);
}
function archiveSettings(settings={}){
  const keys=["provider","model","bothubModel","sceneOutputTokens","chapterEffort","globalInstruction","context"];
  return Object.fromEntries(keys.filter(key=>["string","number"].includes(typeof settings[key]))
    .map(key=>[key,settings[key]]));
}
function fullArchiveValue(){
  const {projects,chats,docs,feedback,expenses,drafts,activeProjectId,activeChatId,theme,settings}=state;
  return {app:"FreitagAI",version:1,data:{projects,chats,docs,feedback,expenses,drafts,activeProjectId,activeChatId,theme,
    settings:archiveSettings(settings)}};
}
async function saveCloudArchive(manual){
  if(cloudPending||busy||preparingPaid){
    if(manual)notice("Дождись завершения текущей операции.");
    return;
  }
  if(!manual&&(!cloudBackupEnabled()||!navigator.onLine||
    Date.now()-Math.max(lastArchiveCheck,Date.parse(cloudPrefs.savedAt)||0)<ARCHIVE_INTERVAL))return;
  lastArchiveCheck=Date.now();
  cloudPending=true;cloudStatus="Сохраняю и проверяю копию в Firebase…";updateCloudControls();
  try{
    const {uid,store}=await master.openFullArchive();
    if(!manual&&uid!==cloudPrefs.uid){cloudStatus="Вход изменился. Автокопия приостановлена.";return;}
    let expected=cloudPrefs.uid===uid?cloudPrefs.id||null:null;
    if(manual){
      const remote=await store.status(),id=remote.current?.id||null;
      if(id&&id!==expected&&!confirm("В Firebase есть копия с другого устройства от "+
        new Date(remote.current.savedAt).toLocaleString("ru-RU")+
        ". Сделать текущие данные новой копией? Прежняя будет доступна для восстановления.")){
        cloudStatus="Копия в Firebase сохранена без изменений.";return;
      }
      expected=id;
    }
    const saved=await store.save(structuredClone(fullArchiveValue()),expected);
    const persisted=setCloudPrefs({uid,id:saved.id,savedAt:saved.savedAt,enabled:true,undo:!!cloudPrefs.undo});
    cloudStatus="Проверенная копия в Firebase от "+new Date(saved.savedAt).toLocaleString("ru-RU")+".";
    if(!persisted)cloudStatus+=" Автокопия включена до закрытия вкладки.";
    if(manual)notice(cloudStatus);
  }catch(err){
    if(err.code==="archive-conflict")setCloudPrefs({...cloudPrefs,enabled:false});
    cloudStatus="Облако: "+err.message;
    if(manual)notice(cloudStatus);
  }finally{cloudPending=false;updateCloudControls();}
}
function restoreProviderChoice(settings){
  if(settings.provider==="polza")settings.provider="modelproxy";
  if(settings.provider==="aitunnel")settings.provider="bothub";
}
async function applyArchive(next,rollback){
  restoreProviderChoice(next.settings);
  next.expenses=restoreExpenses(next);
  const app=$("#app");
  app.inert=true;
  clearTimeout(draftSaveTimer);
  try{
    await saveChain;
    await putDb(next,rollback);
    state=next;projectHomeId=null;pendingMode=null;
  }finally{app.inert=false;}
}
async function restoreCloudArchive(previous){
  if(cloudPending||busy||preparingPaid)return notice("Дождись завершения текущей операции.");
  cloudPending=true;cloudStatus="Проверяю облачную копию…";updateCloudControls();
  try{
    const {uid,store}=await master.openFullArchive();
    const {value,manifest,currentId,usedPrevious}=await store.load(previous);
    if(busy||preparingPaid)throw Error("Сначала дождись завершения генерации.");
    const source=new Date(manifest.savedAt).toLocaleString("ru-RU");
    const data=value.data;
    const label=previous?"Выбрана предыдущая версия от ":usedPrevious?
      "Последняя версия недоступна. Найдена предыдущая от ":"Найдена копия от ";
    const message=label+source+
      " · "+data.chats.length+" чатов, "+data.projects.length+" проектов. Восстановить её на этом устройстве?"+
      " Freitag сохранит текущие данные для отмены восстановления.";
    if(!confirm(message)){cloudStatus="Восстановление отменено.";return;}
    const next={...blank(),...data,settings:{...state.settings,...archiveSettings(data.settings)}};
    await applyArchive(next,structuredClone(state));
    setCloudPrefs({uid,id:currentId,savedAt:manifest.savedAt,
      enabled:!usedPrevious&&cloudPrefs.uid===uid&&cloudPrefs.enabled===true,undo:true});
    cloudStatus="Восстановлена копия от "+source+".";
    render();notice(cloudStatus);
  }catch(err){cloudStatus="Облако: "+err.message;notice(cloudStatus);}
  finally{cloudPending=false;updateCloudControls();}
}
function openMaterial(doc){
  const dialog=document.createElement("dialog");dialog.className="f-dialog f-material-dialog";
  dialog.innerHTML='<form method="dialog"><h2>'+esc(doc.name)+'</h2>'+
    '<textarea class="f-textarea" aria-label="Текст материала" readonly></textarea>'+
    '<div class="f-row"><button class="f-btn" value="close">Закрыть</button>'+
    '<button class="f-btn" type="button" data-material-action="download">Скачать TXT</button>'+
    '<button class="f-btn" value="edit">Изменить</button>'+
    '<button class="f-inline-btn" value="remove">Удалить</button></div></form>';
  dialog.querySelector("textarea").value=doc.text;
  dialog.querySelector('[data-material-action="download"]').addEventListener("click",()=>{
    const name=doc.name.replace(/\.(docx|txt|md|json)$/i,"").replace(/[\\/:*?"<>|]/g,"_").replace(/ё/g,"е").replace(/Ё/g,"Е");
    download((name||"Материал")+".txt",doc.text,"text/plain;charset=utf-8");
  });
  dialog.addEventListener("close",async()=>{
    const action=dialog.returnValue;dialog.remove();
    if(action==="edit")await editMaterial(doc);
    if(action==="remove"&&confirm("Удалить материал «"+doc.name+"»?")){
      state.docs=state.docs.filter(d=>d.id!==doc.id);
      if(!await save())state.docs.unshift(doc);
      render();
    }
  },{once:true});
  document.body.append(dialog);dialog.showModal();
}
async function importMaterials(files,projectId){
  if(!files.length||importingMaterials)return;
  if(!projectId)return notice("Сначала выбери проект.");
  importingMaterials=true;render();
  const added=[],errors=[];
  let duplicate=0;
  try{
    for(const file of files){
      try{
        const {text,format}=await readMaterial(file);
        if([...state.docs,...added].some(d=>d.projectId===projectId&&d.name===file.name&&d.text===text)){
          duplicate++;continue;
        }
        added.push({id:uid(),projectId,name:file.name,text,format,added:stamp()});
      }catch(err){errors.push(file.name+" — "+err.message);}
    }
    if(!project(projectId))return notice("Проект удалён во время загрузки.");
    if(added.length){
      state.docs=[...added,...state.docs];
      if(!await save()){
        const ids=new Set(added.map(d=>d.id));state.docs=state.docs.filter(d=>!ids.has(d.id));return;
      }
    }
    notice([added.length?"Загружено файлов: "+added.length+".":"",duplicate?"Уже в проекте: "+duplicate+".":"",
      ...errors.slice(0,2),errors.length>2?"Других ошибок: "+(errors.length-2)+".":""].filter(Boolean).join(" "));
  }finally{importingMaterials=false;render();}
}
document.addEventListener("click",async(e)=>{
  const nav=e.target.closest("[data-nav]");if(nav){tab=nav.dataset.nav;if(tab==="projects")projectHomeId=null;render();if(tab==="expenses")void refreshExpenses(undefined,true);return;}
  const b=e.target.closest("[data-action]");if(!b)return;
  const a=b.dataset.action,id=b.dataset.id;
  if(a==="expense-unit"){expenseFilters.unit=id;renderExpenses();return;}
  if(a==="refresh-expenses"||a==="expense-receipt"){await refreshExpenses(a==="expense-receipt"?id:undefined);return;}
  if(a==="theme"){state.theme=state.theme==="auto"?"light":state.theme==="light"?"dark":"auto";save();render();}
  if(a==="new-chat"){state.activeChatId=null;pendingMode=null;await save();tab="chat";render();$("#f-message-input")?.focus();}
  if(a==="select-chat"){state.activeChatId=id;state.activeProjectId=chat(id)?.projectId||null;pendingMode=null;await save();tab="chat";render();}
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
      p={id:uid(),name:b.title||"Книга без названия",description:"Канон автоматически из Мастерской",instruction:"",canon:"",voice:"",scene:"",masterBookId:b.id};
      state.projects.unshift(p);
    }
    p.masterCanon=master.canonicalText(b);p.masterSyncedAt=stamp();
    state.activeProjectId=p.id;state.activeChatId=null;projectHomeId=p.id;await save();render();notice("Книга «"+p.name+"» связана с Freitag AI.");
  }
  if(a==="edit-active-project"){const selected=project(chat()?.projectId||state.activeProjectId);if(selected)await editProject(selected.id);}
  if(a==="check-book-source"){
    const p=project(id),out=$("#f-book-check");
    if(!p?.masterBookId||!out)return;
    b.disabled=true;out.textContent="Проверяю Мастерскую…";
    try{
      const gateway=claudeGateway(state.settings.workerUrl,"bothub");
      if(!gateway)throw Error("Не настроен API-шлюз.");
      const options={headers:{Authorization:"Bearer "+await master.idToken()},cache:"no-store"};
      const read=async path=>{
        const res=await fetch(gateway+path,options),data=await res.json().catch(()=>({}));
        if(!res.ok||!data.ok)throw Error(data.error||"Мастерская не ответила.");
        return data;
      };
      const [catalog,book]=await Promise.all([
        read("/mcp-tools"),read("/snapshot?bookId="+encodeURIComponent(p.masterBookId))
      ]);
      const required=["get_book_context","list_chapters","read_chapter"];
      if(!required.every(name=>catalog.tools?.includes(name)))throw Error("В MCP не хватает инструментов чтения книги.");
      if(!Number.isInteger(book.chapterCount)||!Array.isArray(book.lastChapters))
        throw Error("Снимок книги вернул неполные сведения.");
      const last=book.lastChapters.slice(-2).map(ch=>ch.slot+". "+ch.title).join("\n");
      out.textContent="MCP отвечает. Глав в снимке: "+book.chapterCount+
        "\nОбновлено: "+new Date(book.updatedAt).toLocaleString("ru-RU")+
        (typeof book.outlineAvailable==="boolean" ? book.outlineAvailable ?
          "\nУтверждённый каркас есть в снимке." : "\nВ снимке пока нет утверждённого каркаса." : "")+
        (last?"\nПоследние главы:\n"+last:"");
    }catch(err){out.textContent=err.message;}
    finally{b.disabled=false;}
  }
  if(a==="sync-current-book"){
    const p=project(id);
    if(!p?.masterBookId)return notice("Сначала свяжи проект с книгой Мастерской.");
    try{
      // Explicit one-off Google Docs refresh; never during normal chat Send.
      await ensureDriveAccess(p.masterBookId);
      const token=await master.idToken();
      const gateway=claudeGateway(state.settings.workerUrl);
      if(!gateway)throw Error("Не найден API-шлюз.");
      const {status,canon}=await refreshLinkedBook({bookId:p.masterBookId,gateway,idToken:token});
      p.masterCanon=canon;p.masterSyncedAt=status.updatedAt;
      await save();render();notice("Google Docs обновлен в Мастерской. Чатов и данных проекта не меняли.");
    }catch(err){notice("Обновление Google Docs: "+err.message);}
  }
  if(a==="open-project"||a==="project-home"){projectHomeId=id;state.activeProjectId=id;tab="projects";await save();render();}
  if(a==="open-project-materials"){materialsProjectId=id;tab="knowledge";render();}
  if(a==="projects-back"){projectHomeId=null;tab="projects";render();}
  if(a==="open-story-map"){
    const p=project(id);
    if(!p?.masterBookId)return notice("Свяжи проект с одной книгой из Мастерской.");
    const gateway=claudeGateway(state.settings.workerUrl,"bothub");
    openStoryMap({chapter:Number(b.dataset.chapter)||0,
      load:async(chapter,phrase)=>{
        const params=new URLSearchParams({bookId:p.masterBookId,...(chapter?{chapter}:{}),...(phrase?{q:phrase}:{})});
        return readOwnerJson(gateway,"/story-map?"+params,await master.idToken());
      },
      pin:(entry,updatedAt)=>editProjectMemory(p,null,{title:"Глава "+entry.chapter+" · "+(entry.heading||"сцена "+entry.scene),
        content:entry.snippet,anchor:{chapter:entry.chapter,scene:entry.scene,offset:entry.offset,updatedAt}})
    });
  }
  if(a==="project-handoff"){const p=project(id);if(p)handoff.open(p);return;}
  if(a==="open-chapter-jobs")showBackgroundChapters();
  if(a==="preview-chapter"||a==="send-background-chapter"){
    const value=$("#f-message-input")?.value;
    if(!value?.trim())return notice("Введи задание для главы.");
    await sendMessage(value,{previewOnly:a==="preview-chapter",background:a==="send-background-chapter"});
  }
  if(a==="new-project-chat"){state.activeProjectId=id;state.activeChatId=null;projectHomeId=null;pendingMode=null;await save();tab="chat";render();$("#f-message-input")?.focus();}
  if(a==="delete-project"){const p=project(id);if(!p||!confirm("Удалить проект «"+p.name+"» и все его чаты и материалы?"))return;
    if(handoff.managed(id))try{await handoff.revoke(id);}catch(e){return notice("Отзыв доступа не подтвердился. "+e.message);}
    state.projects=state.projects.filter(x=>x.id!==id);state.chats=state.chats.filter(x=>x.projectId!==id);state.docs=state.docs.filter(x=>x.projectId!==id);
    if(state.activeProjectId===id){state.activeProjectId=null;state.activeChatId=null;}await save();render();}
  if(a==="choose-materials")$("#f-upload")?.click();
  if(a==="open-doc"){
    const doc=state.docs.find(d=>d.id===id);if(doc)openMaterial(doc);
  }
  if(a==="add-note")await editMaterial();
  if(a==="add-style"){
    const p=materialsProject();if(!p)return notice("Выбери проект.");
    const v=await openModal("Мой образец письма",[
      {key:"reason",label:"Что мне нравится в этом фрагменте / правило стиля",multi:true,required:true},
      {key:"finalText",label:"Фрагмент моего окончательного текста",multi:true,required:true}
    ]);
    if(v?.reason?.trim()&&v?.finalText?.trim()&&project(p.id)){
      state.feedback.push({id:uid(),projectId:p.id,chatId:null,kind:"good",
        reason:v.reason.trim().slice(0,1500),prompt:"",answer:"",
        finalText:v.finalText.trim().slice(0,18000),source:"Автор",at:stamp()});
      await save();render();notice("Твой авторский образец сохранён в памяти Freitag AI.");
    }
  }
  if(a==="delete-feedback"){
    if(!confirm("Удалить этот пример из памяти стиля?"))return;
    state.feedback=state.feedback.filter(x=>x.id!==id);await save();render();
  }
  if(a==="rename-chat"){const c=chat();if(!c)return;const v=await openModal("Название чата",[{key:"title",label:"Название",required:true}],{title:c.title});if(v){c.title=v.title.trim();await save();render();}}
  if(a==="delete-chat"){const c=chat();if(!c||!confirm("Удалить этот чат?"))return;if(state.drafts)delete state.drafts["chat:"+c.id];state.chats=state.chats.filter(x=>x.id!==c.id);state.activeChatId=null;await save();render();}
  if(a==="copy-answer"){
    const message=chat()?.messages[Number(b.dataset.i)];
    if(message?.role!=="assistant" || !message.content)return;
    try{await navigator.clipboard.writeText(message.content);notice("Ответ скопирован.");}
    catch{notice("Не удалось скопировать. Выдели текст ответа вручную.");}
  }
  if(a==="download-answer"){
    const c=chat(),message=c?.messages[Number(b.dataset.i)];
    if(message?.role!=="assistant"||!message.content)return;
    const title=String(c.title||"Ответ").replace(/[<>:"/\\|?*\u0000-\u001f]/g," ").trim().slice(0,80);
    download((title||"Ответ")+".txt",message.content,"text/plain;charset=utf-8");
  }
  if(a==="expand-draft"){
    const input=$("#f-message-input"),key=draftKey();
    if(busy||!input)return;
    const result=await openModal("Задание для модели",[{key:"draft",label:"Текст задания",multi:true}],
      {draft:input.value},"Готово");
    const current=$("#f-message-input");
    if(!result||!current||draftKey()!==key||busy)return;
    current.value=result.draft;
    current.dispatchEvent(new Event("input",{bubbles:true}));
    current.focus({preventScroll:true});
  }
  if(a==="search-book-context"){
    const input=$("#f-message-input"),key=draftKey();
    if(busy||!input)return;
    const lines=/^Поиск по книге:[ \t]*([^\r\n]*)(?:\r?\n|$)/gim;
    const existing=[...input.value.matchAll(lines)].at(-1)?.[1].trim();
    const source=await openModal("Найти фразу в книге",[
      {key:"query",label:"Одна точная фраза или две через точку с запятой"}
    ],{query:existing},"Сохранить в задании");
    const current=$("#f-message-input");
    if(!source||!current||draftKey()!==key||busy)return;
    const text=current.value.replace(lines,"");
    const extra=source.query.trim()&&"Поиск по книге: "+source.query.trim();
    current.value=extra?text+(text&&!text.endsWith("\n\n")?"\n\n":"")+extra:text;
    current.dispatchEvent(new Event("input",{bubbles:true}));
    $("#f-chat-tools").open=false;
    current.focus({preventScroll:true});
  }
  if(a==="stop")currentController?.abort();
  if(a==="check-batch-availability"){await checkBatchAvailability();return;}
  if(a==="send-batch-chapter"){
    const text=$("#f-message-input")?.value||"";
    if(!text.trim())return notice("Вставь привычный полный промпт главы.");
    await sendBatchChapter(text);return;
  }
  if(a==="retry-batch-chapter"){
    const c=chat(),last=[...(c?.messages||[])].reverse().find(m=>m.role==="user");
    if(!last)return notice("Исходный промпт не найден.");
    await sendBatchChapter(last.content);return;
  }
  if(a==="check-batch-chapter"){await checkBatchChapter();return;}
  if(a==="test-connection")await testConnection();
  if(a==="ask-local"){const v=$("#f-message-input")?.value||"";if(v.trim()){await sendMessage(v);}else notice("Напиши задачу.");}
  if(a==="export-context"){const v=$("#f-message-input")?.value||"";if(v.trim()){await prepareExternal(v);}else notice("Сначала напиши задачу, чтобы подготовить контекст книги.");}
  if(a==="paste-external")await saveExternalAnswer();
  if(a==="open-expenses"){tab="expenses";render();void refreshExpenses();return;}
  if(a==="return-task" && !busy){
    const c=chat(), field=$("#f-message-input");
    const original=c?.messages.slice(0,Number(b.dataset.i)).findLast(m=>m.role==="user");
    if(!field || !original)return;
    if(field.value.trim() && field.value!==original.content)return notice("Поле уже содержит черновик. Сохрани его перед возвратом задания.");
    field.value=original.content;
    rememberDraft(field.value);await save();resizeChatInput(field);field.focus();notice("Задание возвращено в черновик.");return;
  }
  if(a==="feedback-good"||a==="feedback-bad")await saveFeedback(Number(b.dataset.i),a==="feedback-good"?"good":"bad");
  if(a==="remember-decision"){
    const c=chat();
    if(c?.projectId)await editProjectMemory(project(c.projectId),null,c.messages[Number(b.dataset.i)]);
  }
  if(a==="edit-project-memory")await editProjectMemory(project(projectHomeId),id);
  if(a==="add-project-memory")await editProjectMemory(project(projectHomeId));
  if(a==="remove-project-memory"){
    const p=project(projectHomeId);
    if(!p?.memoryNotes?.some(note=>note.id===id)||!confirm("Убрать это решение из памяти проекта?"))return;
    p.memoryNotes=p.memoryNotes.filter(note=>note.id!==id);
    await save();render();notice("Решение убрано из памяти проекта.");
  }
  if(a==="open-settings"){tab="settings";render();}
  if(a==="apimira-receipt"){
    const c=chat(),message=c?.messages[Number(b.dataset.i)];
    if(!message?.apimiraRequestId)return;
    b.disabled=true;
    try{
      const ready=await readApimiraReceipt(message,c,claudeGateway(state.settings.workerUrl,"apimira"),await master.idToken());
      if(!ready)notice("Списание пока не появилось в детализации ApiMira.");
    }catch(err){notice(err.message);}
    finally{b.disabled=false;}
  }
  if(a==="bothub-receipt"){
    const c=chat(),message=c?.messages[Number(b.dataset.i)];
    if(!message?.apiRequestId&&!message?.providerRequestId)return;
    b.disabled=true;
    try{
      const ready=await readBothubReceipt(message,c,claudeGateway(state.settings.workerUrl,"bothub"),await master.idToken());
      if(!ready)notice("В истории BotHub пока нет записи с этим номером запроса.");
    }catch(err){notice(err.message);}
    finally{b.disabled=false;}
  }
  if(a==="archive-save")await saveCloudArchive(true);
  if(a==="archive-load")await restoreCloudArchive();
  if(a==="archive-load-previous")await restoreCloudArchive(true);
  if(a==="archive-pause"){
    setCloudPrefs({...cloudPrefs,enabled:false});
    cloudStatus="Автокопия выключена. Копии в Firebase доступны для восстановления.";updateCloudControls();
  }
  if(a==="archive-undo"){
    if(cloudPending||busy||preparingPaid)return notice("Дождись завершения текущей операции.");
    cloudPending=true;updateCloudControls();
    try{
      const old=await getDb("before-cloud-restore");
      if(!old)throw Error("Предыдущий локальный архив недоступен.");
      if(busy||preparingPaid)throw Error("Сначала дождись завершения генерации.");
      if(!confirm("Вернуть сохранённые локальные данные? Для отмены этого действия можно снова восстановить копию Firebase."))return;
      await applyArchive(old,structuredClone(state));
      setCloudPrefs({...cloudPrefs,enabled:false,undo:false});
      cloudStatus="Локальный архив возвращён. Автокопия выключена.";
      render();notice(cloudStatus);
    }catch(err){notice(err.message);}
    finally{cloudPending=false;updateCloudControls();}
  }
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
  if(e.target.id==="f-chat-form"){e.preventDefault();const inp=$("#f-message-input"),val=inp?.value||"";if(!val.trim())return;await sendMessage(val);}
  if(e.target.id==="f-project-instructions"){
    e.preventDefault();
    const p=project(e.target.dataset.projectId);
    if(!p)return;
    const fd=new FormData(e.target);
    p.instruction=String(fd.get("instruction")||"");
    p.voice=String(fd.get("voice")||"");
    p.canon=String(fd.get("canon")||"");
    p.scene=String(fd.get("scene")||"");
    p.storyMap=String(fd.get("storyMap")||"");
    await save();notice("Твои инструкции сохранены в проекте.");
    return;
  }
  if(e.target.id==="f-master-auth"){
    e.preventDefault();const fd=new FormData(e.target);const password=String(fd.get("password")||"");
    try{await master.login(String(fd.get("email")||"").trim(),password);render();notice("Мастерская подключена. Книги доступны только для чтения.");}
    catch(err){notice("Вход в Мастерскую не удался: "+err.message);}return;
  }
  if(e.target.id==="f-settings"){e.preventDefault();const fd=new FormData(e.target);
    const url=safeEndpoint(String(fd.get("endpoint")||""));if(!url)return notice("Неверный адрес Ollama.");
    const provider=String(fd.get("provider")||"ollama");
    if(provider!=="ollama"&&!paidProviders.includes(provider))return notice("Неверный провайдер.");
    const workerRaw=String(fd.get("workerUrl")||"").trim();
    const workerUrl=workerRaw?safeWorkerEndpoint(workerRaw):"";
    if(workerRaw&&!workerUrl)return notice("Неверный HTTPS-адрес Cloudflare Worker.");
    const bothubModel=String(fd.get("bothubModel")||"claude-sonnet-5.5");
    if(!["claude-sonnet-5.5","claude-opus-5.5"].includes(bothubModel))return notice("Неизвестная модель BotHub.");
    state.settings.provider=provider;state.settings.workerUrl=workerUrl;state.settings.bothubModel=bothubModel;
    state.settings.endpoint=url;state.settings.model=String(fd.get("model")||"").trim();
    state.settings.globalInstruction=String(fd.get("globalInstruction")||"");
    state.settings.context=Number(fd.get("context"))||4096;
    state.theme=String(fd.get("theme"))||"auto";
    connectOk=false;connectText=activeProviderLabel()+" · проверь соединение в настройках";
    await save();render();notice("Настройки сохранены.");}
});
document.addEventListener("change",async(e)=>{
  if(e.target.id==="f-quick-model"){
    const val=String(e.target.value||"");
    const provider=val.startsWith("bothub:")?"bothub":val;
    if(provider!=="ollama"&&!paidProviders.includes(provider))return;
    if(provider==="bothub"){
      const model=val.slice(7);
      if(!["claude-opus-5.5","claude-sonnet-5.5"].includes(model))return;
      state.settings.bothubModel=model;
    }
    state.settings.provider=provider;
    const input=$("#f-message-input");
    if(input){if(!state.drafts)state.drafts={};state.drafts[draftKey()]=input.value;}
    connectOk=false;connectText="Модель выбрана · "+activeProviderLabel();
    await save();render();return;
  }
  if(e.target.id==="f-provider"||e.target.id==="f-bothub-model"){
    const provider=$("#f-provider")?.value||"bothub";
    const model=$("#f-bothub-model")?.value||"claude-opus-5.5";
    if((provider!=="ollama"&&!paidProviders.includes(provider)) ||
       !["claude-sonnet-5.5","claude-opus-5.5"].includes(model))return;
    state.settings.provider=provider;state.settings.bothubModel=model;
    connectOk=false;connectText=activeProviderLabel()+" · не проверено";
    await save();
    const funds=$("#f-modelproxy-funds");if(funds)funds.hidden=provider!=="modelproxy";
    const row=$("#f-bothub-model-row");if(row)row.hidden=provider!=="bothub";
    const status=$("#f-test-status");if(status)status.textContent="Модель сохранена. Проверка не запускает платную генерацию.";
    renderHeader();
    return;
  }
  if(e.target.id==="f-writing-mode"){
    if(!WRITING_MODES[e.target.value])return;
    const c=chat();if(c){c.mode=e.target.value;await save();}else pendingMode=e.target.value;
    const lengthRow=$("#f-chapter-limit-wrap");if(lengthRow)lengthRow.hidden=e.target.value!=="draft";
    const effortRow=$("#f-effort-wrap");if(effortRow)effortRow.hidden=e.target.value!=="draft";
    return;
  }
  if(e.target.id==="f-chapter-limit"){
    const limit=Number(e.target.value);
    if(!CHAPTER_LIMITS.includes(limit))return;
    state.settings.sceneOutputTokens=limit;
    await save();return;
  }
  if(e.target.id==="f-book-scope"){
    const p=project();
    if(!p || preparingPaid || busy || !["auto","full"].includes(e.target.value))return;
    p.manuscriptScope=e.target.value;
    await save();renderChat();
    return;
  }
  if(e.target.id==="f-chapter-effort"){
    if(!CHAPTER_EFFORTS.includes(e.target.value))return;
    state.settings.chapterEffort=e.target.value;
    await save();return;
  }
  if(["f-expense-period","f-expense-project","f-expense-provider"].includes(e.target.id)){
    const id=e.target.id;
    expenseFilters[id.slice("f-expense-".length)]=e.target.value;
    renderExpenses();document.getElementById(id)?.focus({preventScroll:true});return;
  }
  if(e.target.dataset.docContext){
    const doc=state.docs.find(d=>d.id===e.target.dataset.docContext);if(!doc)return;
    const select=e.target, before=materialMode(doc), value=select.value;
    if(!["auto","priority","archive"].includes(value))return;
    const previous={includeInContext:doc.includeInContext,priority:doc.priority};
    doc.includeInContext=value!=="archive";doc.priority=value==="priority";
    if(!await save()){Object.assign(doc,previous);select.value=before;}
    return;
  }
  if(e.target.id==="f-sidebar-project"||e.target.id==="f-chat-project"){
    state.activeProjectId=e.target.value||null;state.activeChatId=null;pendingMode=null;await save();render();return;
  }
  if(e.target.id==="f-upload"){
    const files=Array.from(e.target.files||[]);e.target.value="";
    await importMaterials(files,materialsProject()?.id);return;
  }
  if(e.target.id==="f-import"){
    const file=e.target.files?.[0];if(!file)return;
    try{if(file.size>25*1024*1024)throw new Error("Архив слишком большой.");
      const data=JSON.parse(await file.text());
      if(data.app!=="FreitagAI"||!Array.isArray(data.data?.projects)||!Array.isArray(data.data?.chats)||!Array.isArray(data.data?.docs))throw new Error("Это не архив Freitag AI.");
      if(!confirm("Заменить текущие чаты, проекты и материалы импортированным архивом?"))return;
      state={...blank(),...data.data,feedback:Array.isArray(data.data.feedback)?data.data.feedback:[],settings:{...blank().settings,...data.data.settings}};
      restoreProviderChoice(state.settings);
      state.expenses=restoreExpenses(state);
      await save();render();notice("Архив импортирован.");
    }catch(err){notice("Ошибка импорта: "+err.message);}
  }
});
document.addEventListener("input",e=>{
  if(e.target.id==="f-material-search"){
    const term=e.target.value.trim().toLocaleLowerCase("ru-RU");
    const items=[...document.querySelectorAll("[data-material-name]")];
    for(const row of items)row.hidden=!row.dataset.materialName.toLocaleLowerCase("ru-RU").includes(term);
    $("#f-material-no-matches").hidden=items.some(row=>!row.hidden);
  }
  if(e.target.id==="f-message-input"){
    resizeChatInput(e.target);
    rememberDraft(e.target.value);
    const count=e.target.value.length;
    $("#f-draft-size").textContent=count?count.toLocaleString("ru-RU")+" зн.":"";
  }
});
document.addEventListener("keydown",e=>{
  if(e.target.id==="f-message-input"&&e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&!e.isComposing){
    e.preventDefault();if(!busy)e.target.closest("form")?.requestSubmit();
  }
});
const workingLink=$("#f-working-link");
if(workingLink){
  const isWorking=location.origin===workingLink.origin;
  const isPreview=/(?:^|\.)freitag-ai-test\.pages\.dev$/.test(location.hostname)&&!isWorking;
  if(isWorking)$("#f-workspace-mode").textContent="Рабочая версия";
  if(isPreview){
    $("#f-workspace-mode").textContent="Тестовая копия · чаты отдельно";
    $("#f-workshop-link").hidden=true;
    workingLink.hidden=false;
  }
}
(async()=>{
  try{db=await openDb();const loaded=await getDb();if(loaded&&Array.isArray(loaded.projects)&&Array.isArray(loaded.chats))state={...blank(),...loaded,settings:{...blank().settings,...loaded.settings}};
    // Migrate existing test settings: Polza is no longer available.
    restoreProviderChoice(state.settings);}
  catch(e){$("#panel").innerHTML=empty("Хранилище недоступно","Разреши браузеру сохранять данные сайта: "+e.message);return;}
  state.settings.bothubModel=["claude-sonnet-5.5","claude-opus-5.5"].includes(state.settings.bothubModel)?
    state.settings.bothubModel:"claude-sonnet-5.5";
  state.feedback=Array.isArray(state.feedback)?state.feedback:[];
  state.expenses=restoreExpenses(state);
  state.drafts=state.drafts&&typeof state.drafts==="object"&&!Array.isArray(state.drafts)?state.drafts:{};
  render();
  // Reuse an existing Firebase session and silently load the books list.
  // This never starts Google Drive OAuth and does not send a paid model request.
  master.init().then(async()=>{updateCloudControls();if(master.user){if(tab==="expenses"||state.expenses.some(canReconcileExpense))void refreshExpenses(undefined,true);await master.refresh();if(tab==="projects")render();}}).catch(()=>{});
  const syncBilling=()=>{if(tab==="expenses"||state.expenses.some(canReconcileExpense))void refreshExpenses(undefined,true);};
  setInterval(syncBilling,60000);
  setInterval(()=>void handoff.sync(),60000);
  document.addEventListener("visibilitychange",()=>{if(!document.hidden)syncBilling();});
  setInterval(()=>void saveCloudArchive(false),60000);
  // Не требуем от пользователя вручную проверять уже настроенную Ollama
  // при каждом обновлении страницы. Это тихая проверка без всплывающих окон.
  probeLocalConnection().catch(()=>{});
})();
