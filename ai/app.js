// Freitag AI — персональная литературная среда: сменяемые модели, память и контекст автора.
import { master } from './master-sync.js';
import { renderMarkdown } from './markdown.js';
import { projectHomeHtml } from './project-view.js';
import { ensureDriveAccess, refreshLinkedBook } from './live-context.js';
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
const blank = () => ({projects:[], chats:[], docs:[], feedback:[], drafts:{}, activeProjectId:null, activeChatId:null,
  settings:{provider:"bothub",endpoint:"http://localhost:11434",model:"qwen3:4b-instruct",workerUrl:"",bothubModel:"claude-opus-5.5",sceneOutputTokens:14000,globalInstruction:"",context:4096}, theme:"auto"});
let state=blank(), tab="chat", projectHomeId=null, busy=false, preparingPaid=false, currentController=null, db=null, connectOk=false, connectText="Подключение не проверено", pendingMode=null, batchCheck=null;
const MAX_DOC=2*1024*1024;
const openDb=()=>new Promise((resolve,reject)=>{const r=indexedDB.open("freitag-ai-v1",1);r.onupgradeneeded=()=>r.result.createObjectStore("data");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const getDb=()=>new Promise((resolve,reject)=>{const r=db.transaction("data").objectStore("data").get("state");r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
const putDb=(v)=>new Promise((resolve,reject)=>{const t=db.transaction("data","readwrite");t.objectStore("data").put(v,"state");t.oncomplete=resolve;t.onerror=()=>reject(t.error);});
let saveChain=Promise.resolve();
const save=()=>{const snapshot=structuredClone(state); saveChain=saveChain.catch(()=>{}).then(()=>putDb(snapshot)).catch(e=>notice("Не удалось сохранить данные: "+e.message));return saveChain;};
const notice=(msg)=>{let el=$("#f-flash");if(!el){el=document.createElement("div");el.id="f-flash";el.className="f-notice f-flash";document.body.appendChild(el);}el.textContent=msg;el.hidden=false;clearTimeout(notice.timer);notice.timer=setTimeout(()=>el.hidden=true,7000);};
const project=(id=state.activeProjectId)=>state.projects.find(p=>p.id===id);
const chat=(id=state.activeChatId)=>state.chats.find(c=>c.id===id);
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
function renderSidebar(){
  const el=$("#sidebar-content");
  if(tab==="chat"){
    const selected=state.activeProjectId||null;
    const arr=state.chats.filter(x=>(x.projectId||null)===selected)
      .sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||"")));
    el.innerHTML=
      '<button type="button" class="f-btn primary f-new-chat" data-action="new-chat"><span aria-hidden="true">＋</span> Новый чат</button>'+
      '<div class="f-side-section"><label for="f-sidebar-project" class="f-side-label">ПРОЕКТ</label>'+
      '<select id="f-sidebar-project" class="f-select" aria-label="Активная книга"><option value="">Без книги</option>'+
      state.projects.map(x=>'<option value="'+esc(x.id)+'" '+(x.id===selected?"selected":"")+'>'+esc(x.name)+'</option>').join("")+
      '</select>'+(selected?'<button type="button" class="f-project-shortcut" data-action="project-home" data-id="'+esc(selected)+'">Инструкции проекта ↗</button>':"")+'</div>'+
      '<div class="f-side-section f-side-history"><div class="f-side-label f-side-count">ИСТОРИЯ <span>'+arr.length+'</span></div>'+
      (arr.length?'<ul class="f-list f-chat-list">'+arr.map(x=>
        '<li><button type="button" class="'+(x.id===state.activeChatId?"on":"")+
        '" data-action="select-chat" data-id="'+esc(x.id)+'" title="'+esc(x.title)+'"><span>'+esc(x.title)+'</span></button></li>'
      ).join("")+'</ul>':'<p class="f-sidebar-empty">Здесь появятся диалоги по выбранной книге.</p>')+
      '</div>';
  }else if(tab==="projects"){
    el.innerHTML='<div class="f-side-label">ТВОЯ БИБЛИОТЕКА</div>'+
      '<p class="f-sidebar-empty">'+state.projects.length+' книг в работе</p>'+
      '<button type="button" data-action="add-project" class="f-btn f-new-chat">＋ Добавить книгу</button>';
  }else if(tab==="knowledge"){
    el.innerHTML='<div class="f-side-label">ЛОКАЛЬНЫЕ МАТЕРИАЛЫ</div>'+
      '<p class="f-sidebar-empty">'+state.docs.length+' текстов и заметок. Хранятся в этом браузере.</p>';
  }else{
    el.innerHTML='<div class="f-side-label">ПОДКЛЮЧЕНИЯ</div>'+
      '<p class="f-sidebar-empty">Здесь настраиваются модели, внешний вид и резервные копии.</p>';
  }
}
function renderHeader(){
  document.querySelectorAll("[data-nav]").forEach(b=>b.classList.toggle("on",b.dataset.nav===tab));
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
    '<p class="f-muted f-bottom-note">Чаты и рабочие заметки пока хранятся в этом браузере — для резервной копии используй экспорт в настройках.</p></div>';
}
function renderKnowledge(){
  const docs=state.docs.filter(d=>!state.activeProjectId||d.projectId===state.activeProjectId);
  const examples=state.feedback.filter(f=>!state.activeProjectId||f.projectId===state.activeProjectId).slice().reverse();
  $("#panel").innerHTML='<div class="f-content">'+titleLine("Материалы","Тексты, заметки и авторские образцы.")+
  '<div class="f-notice">Канон из «Мастерской» и загруженные главы — источники. Авторские образцы и замечания — правила стиля. Ни один из этих материалов сам по себе не меняет веса модели.</div>'+
  '<div class="f-section"><label class="f-label">Проект</label><select class="f-select" id="f-doc-project"><option value="">Выбери проект</option>'+
    state.projects.map(p=>'<option value="'+esc(p.id)+'" '+(p.id===state.activeProjectId?"selected":"")+'>'+esc(p.name)+'</option>').join("")+'</select></div>'+
  (state.activeProjectId?'<div class="f-section"><h2>Добавить материал</h2><p class="f-muted">Только .txt, .md или .json, до 2 МБ за файл. Содержимое остаётся в твоём браузере и не публикуется на GitHub.</p><input id="f-upload" class="f-upload" type="file" accept=".txt,.md,.json,text/plain,application/json"><div class="f-row" style="margin-top:10px"><button class="f-btn" data-action="add-note">+ Добавить заметку</button></div></div>':'<div class="f-notice">Сначала создай или выбери проект.</div>')+
  '<div class="f-section"><h2>Материалы'+(state.activeProjectId?" проекта":"")+'</h2>'+
    (docs.length?'<ul class="f-list">'+docs.map(d=>'<li class="f-spread"><div><strong>'+esc(d.name)+'</strong><p class="f-muted">'+(d.text.length).toLocaleString("ru-RU")+' знаков</p></div><button class="f-btn danger" data-action="delete-doc" data-id="'+esc(d.id)+'">Удалить</button></li>').join("")+'</ul>':empty("Материалов нет","Добавь главу или текстовую заметку."))+'</div>'+
  '<div class="f-section"><div class="f-spread"><div><h2>Мой стиль · память соавтора</h2><p class="f-muted">Одобренные сцены, твои правки и причины отказов. Они будут учитываться в заданиях для выбранной модели.</p></div>'+
    (state.activeProjectId?'<button class="f-btn" data-action="add-style">+ Мой образец</button>':"")+'</div>'+
    (examples.length?'<div class="f-examples">'+examples.map(x=>'<article class="f-example"><div class="f-spread"><strong>'+(x.kind==="good"?"Одобрено":"Не повторять")+' · '+esc(x.source||"Автор")+'</strong>'+
      '<button class="f-btn danger" data-action="delete-feedback" data-id="'+esc(x.id)+'">Удалить</button></div>'+
      '<p>'+esc(x.reason||"")+'</p><p class="f-muted">'+esc(String(x.finalText||x.answer||"").slice(0,260))+'</p></article>').join("")+'</div>':
      empty("Примеров пока нет","Добавь любимый абзац или сохрани ответ кнопкой «В образцы»."))+
    '</div></div>';
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
    '<details class="f-settings-fold"><summary>Защищенный API-шлюз · ModelProxy / BotHub / ApiMira</summary>'+
    '<div class="f-fold-body"><label for="f-worker">Cloudflare Worker</label>'+
    '<input id="f-worker" class="f-text-field" name="workerUrl" value="'+esc(s.workerUrl||"")+'" placeholder="https://freitag-opus-gateway....workers.dev">'+
    '<p class="f-muted">В тестовой версии Cloudflare Pages шлюз выбирается автоматически. Freitag AI напрямую вызывает MCP-инструменты Мастерской для чтения книг, доходов, маркетинга и Директа. Для главы используется последний снимок книги в Мастерской. После правок в рукописи нажми «Обновить Google Docs» в проекте. Секреты хранятся только в Cloudflare.</p></div></details>'+
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
    '<p class="f-muted">Чаты и заметки хранятся в этом браузере. Полный JSON-архив можно скачать. Память проектов и образцы можно вручную сохранить в Firebase.</p>'+
    '<p class="f-muted">Принятых образцов: '+state.feedback.filter(x=>x.kind==="good").length+
    ' · отклоненных: '+state.feedback.filter(x=>x.kind==="bad").length+'</p>'+
    '<div class="f-row"><button type="button" class="f-btn" data-action="export">Скачать архив JSON</button>'+
    '<label class="f-btn f-file-label">Импортировать JSON<input id="f-import" type="file" accept=".json,application/json" hidden></label></div>'+
    '<div class="f-row"><button type="button" class="f-btn" data-action="cloud-save">Сохранить память в Firebase</button>'+
    '<button type="button" class="f-btn" data-action="cloud-load">Восстановить из Firebase</button></div>'+
    '</div></details>'+
    '<div class="f-settings-save"><button type="submit" class="f-btn primary">Сохранить настройки</button></div>'+
    '</form></div>';
}
const activeBotHubModel=()=>state.settings.bothubModel==="claude-opus-5.5"?"claude-opus-5.5":"claude-sonnet-5.5";
const activeClaudeName=()=>activeBotHubModel()==="claude-opus-5.5"?"Claude Opus 5.5":"Claude Sonnet 5.5";
const activeProviderLabel=()=>state.settings.provider==="modelproxy"?"Claude Opus 5.5 · ModelProxy":
  state.settings.provider==="bothub"?activeClaudeName()+" · BotHub":state.settings.provider==="apimira"?"Claude Opus 5.5 · ApiMira":"Локальная Qwen · Ollama";
const currentModelChoice=()=>state.settings.provider==="bothub"?
  "bothub:"+activeBotHubModel():state.settings.provider;
const isSimpleGreeting = text => /^(?:привет(?:ик)?|здравствуй(?:те)?|доброе (?:утро)|добрый (?:день|вечер)|hello|hi|спасибо|ок(?:ей)?|да|нет)[!?.\s]*$/i.test(String(text||"").trim());
const modelChoices=()=>[
  ["bothub:claude-opus-5.5","Opus 5.5 · BotHub"],
  ["bothub:claude-sonnet-5.5","Sonnet 5.5 · BotHub"],
  ["apimira","Opus 5.5 · ApiMira"],
  ["modelproxy","Opus 5.5 · ModelProxy"],
  ["ollama","Qwen · локально"]
].map(([id,label])=>'<option value="'+id+'" '+(currentModelChoice()===id?"selected":"")+'>'+label+'</option>').join("");
function renderChat(){
  const c=chat();
  if(c && c.projectId!==state.activeProjectId)state.activeProjectId=c.projectId||null;
  const p=project(c?.projectId||state.activeProjectId);
  const body=(c?.messages||[]).map((m,i)=>
    '<article class="f-msg '+esc(m.role)+'"><div class="f-speaker">'+
    (m.role==="user"?"Ты":m.provider==="Claude"?"Claude Opus":String(m.provider||"").startsWith("Claude ") ? esc(m.provider) :m.provider==="Внешняя модель"?"Внешняя модель":"Freitag AI")+
    '</div><div class="f-msg-text">'+(m.role==="assistant"?renderMarkdown(m.content):'<p>'+esc(m.content).replace(/\n/g,"<br>")+'</p>')+'</div>'+
    (m.receiving && !busy?'<p class="f-mini">Получен фрагмент. Завершение главы не подтверждено.</p>':"")+
    (m.role==="assistant" && m.content && !m.content.startsWith("Не удалось")?
      '<div class="f-feedback-actions"><button type="button" class="f-inline-btn" data-action="copy-answer" data-i="'+i+'">Копировать</button>'+
      '<button type="button" class="f-inline-btn" data-action="feedback-good" data-i="'+i+'">В образцы</button>'+
      '<button type="button" class="f-inline-btn" data-action="feedback-bad" data-i="'+i+'">Не то</button></div>':"")+
    '</article>').join("");
  const modeOptions=Object.entries(WRITING_MODES).map(([key,v])=>
    '<option value="'+key+'" '+((c?.mode||pendingMode||(p?"draft":"dialog"))===key?"selected":"")+'>'+esc(v.name)+'</option>').join("");
  const mobileChats=state.chats.filter(x=>(x.projectId||null)===(p?.id||null))
    .sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||"")));
  const mobileHistory=mobileChats.length
    ?'<div class="f-mobile-history-panel">'+mobileChats.map(x=>
       '<button type="button" data-action="select-chat" data-id="'+esc(x.id)+
       '" class="'+(x.id===state.activeChatId?"on":"")+'">'+esc(x.title)+'</button>'
      ).join("")+'</div>'
    :'<div class="f-mobile-history-panel"><p>Диалогов пока нет.</p></div>';
  const bookOptions='<option value="">Без книги</option>'+state.projects.map(x=>
    '<option value="'+esc(x.id)+'" '+(x.id===(p?.id||"")?"selected":"")+'>'+esc(x.name)+'</option>').join("");
  $("#panel").innerHTML=
    '<section class="f-chat" aria-label="Литературный чат">'+
    '<div class="f-chat-meta"><div class="f-chat-identity">'+
    '<h1 class="f-title">'+esc(c?.title&&c.title!=="Новый чат"?c.title:"Новый диалог")+'</h1>'+
    '<div class="f-chat-book"><label for="f-chat-project">Книга</label>'+
    '<select id="f-chat-project" class="f-select" aria-label="Выбрать книгу">'+bookOptions+'</select>'+
      (p?'<button type="button" class="f-project-open-link" data-action="project-home" data-id="'+esc(p.id)+'">Инструкции проекта</button>':"")+'</div></div>'+
    '<div class="f-chat-head-actions">'+
    '<button type="button" class="f-btn f-btn-new" data-action="new-chat">＋ Новый чат</button>'+
    '<details class="f-mobile-history"><summary aria-label="История разговоров">История</summary>'+
      mobileHistory+'</details>'+
    (c?'<details class="f-chat-more"><summary aria-label="Действия с чатом" title="Действия с чатом">···</summary>'+
      '<div class="f-chat-more-menu"><button type="button" data-action="rename-chat">Переименовать</button>'+
      '<button type="button" class="f-destructive" data-action="delete-chat">Удалить чат</button></div></details>':"")+
    '</div></div>'+
    '<div class="f-chat-body" id="f-messages" role="log" aria-live="polite" aria-relevant="additions text">'+
      (body||'<div class="f-chat-welcome"><span class="f-welcome-mark" aria-hidden="true"><img src="../workshop/bear.svg" alt="" width="55" height="55"></span>'+
        '<h2>Место для твоих историй.</h2><p>Выбери книгу, задай вопрос или начни новую сцену.</p></div>')+
    '</div>'+
    '<form id="f-chat-form" class="f-compose">'+
      '<div class="f-compose-surface"><div class="f-writing-bar">'+
      '<label class="f-compact-label" for="f-quick-model">Модель</label>'+
      '<select id="f-quick-model" class="f-select f-quick-model" aria-label="Модель для следующего ответа" '+(busy?"disabled":"")+'>'+modelChoices()+'</select>'+
      (p?'<span id="f-chapter-limit-wrap"><label class="f-compact-label" for="f-chapter-limit">Лимит главы</label>'+'<select class="f-select" id="f-chapter-limit" title="Максимум выходных токенов. Это верхний предел, не заданная длина главы.">'+[[4500,"4 500"],[9000,"9 000"],[14000,"14 000"]].map(([n,label])=>'<option value="'+n+'" '+(Number(state.settings.sceneOutputTokens||14000)===n?"selected":"")+'>'+label+'</option>').join("")+'</select></span>':'<label class="f-compact-label" for="f-writing-mode">Тип ответа</label>'+
      '<select class="f-select" id="f-writing-mode" '+(busy?"disabled":"")+'>'+modeOptions+'</select>')+
      '<span class="f-compose-canon">'+(p?.masterBookId?"MCP Мастерская · автоматически":p?"Инструкции проекта":"Обычный чат")+'</span>'+
      '</div>'+
      '<label class="f-visually-hidden" for="f-message-input">Задание для модели</label>'+
      '<textarea class="f-textarea" id="f-message-input" rows="2" placeholder="Напиши задачу или вставь фрагмент текста…" '+(busy?"disabled":"")+'>\n'+esc(state.drafts?.[draftKey()]||"")+'</textarea>'+
      '<div class="f-compose-controls">'+
      '<span class="f-mini" title="'+esc(connectText)+'">'+esc(activeProviderLabel())+
      (connectOk?' · подключено':"")+'</span>'+
      (busy?'<button type="button" class="f-btn danger" data-action="stop">Остановить</button>':
            '<button type="submit" class="f-btn primary">Отправить <span aria-hidden="true">↗</span></button>')+
      '</div></div>'+
      (p&&state.settings.provider==="bothub"&&activeBotHubModel()==="claude-opus-5.5"?
        '<div class="f-row"><button type="button" class="f-btn" data-action="check-batch-availability">Проверить Batch бесплатно</button>'+(batchCheck===true?'<span class="f-mini">Opus 5.5 есть в каталоге Batch; разрешение запуска не проверено</span>':batchCheck===false?'<span class="f-mini">Batch недоступен</span>':"")+'</div>'+(batchCheck===true?'<div class="f-row"><button type="button" class="f-btn" data-action="send-batch-chapter">Целая глава через Batch API (платно)</button></div>':""):"")+
      (c?.batch?.batchId&&c.batch.status!=="completed"?
        '<div class="f-row"><span class="f-mini">Batch: '+esc(c.batch.status||"отправлен")+'</span>'+
        '<button type="button" class="f-btn" data-action="check-batch-chapter">Проверить готовность главы</button></div>':"")+
      (state.settings.provider==="bothub"&&activeBotHubModel()==="claude-opus-5.5"&&!c?.batch?.batchId&&c?.messages?.at(-1)?.role==="assistant"&&/HTTP 524|вернул 524/.test(c.messages.at(-1).content)&&p?
        '<div class="f-row"><button type="button" class="f-btn" data-action="retry-batch-chapter">Эту главу — через Batch API</button></div>':"")+
      '<details class="f-extra-tools"><summary>Инструменты и подключение</summary><div class="f-row">'+
      '<button type="button" class="f-btn" data-action="export-context">Скопировать контекст</button>'+
      '<button type="button" class="f-btn" data-action="paste-external">Добавить внешний ответ</button>'+
      '<button type="button" class="f-btn" data-action="open-settings">Настройки модели</button></div>'+
      '<p class="f-muted">Текст отправляется выбранной модели только после нажатия «Отправить». Проектные материалы сохраняются в браузере.</p></details>'+
    '</form></section>';
  const historyEl=$("#f-messages");
  if(historyEl&&c?.messages?.length)historyEl.scrollTop=historyEl.scrollHeight;
  resizeChatInput($("#f-message-input"));
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
function modelproxyMessages(c){
  // Claude Projects-style workflow: one editable instruction, an unchanged
  // full user request in every chapter chat and no injected style templates.
  const p=project(c.projectId);
  const messages=c.messages.filter(m=>m.role==="user"||m.role==="assistant");
  const latest=messages.at(-1)?.content||"";
  const projectInstructions=[
    userInstruction(state.settings.globalInstruction),
    userInstruction(p?.instruction),
    p?.voice?"Дополнительные инструкции автора о стиле:\n"+p.voice:"",
    p?.canon?"Дополнительные сведения автора:\n"+p.canon:"",
    p?.scene?"Заметки автора о текущей сцене:\n"+p.scene:""
  ].filter(Boolean).join("\n\n");
  // The original request, including an entire preceding chapter, stays intact.
  // No truncation, excerpt selection, automatic prompt rewriting or restart.
  // Any request that exceeds the gateway limit produces a visible error before
  // a paid provider call rather than silently dropping author material.
  // A retry after HTTP 524 must not bill the same 40k-character prompt twice
  // inside its own history. Keep the latest author request verbatim.
  const history=messages.slice(-7,-1)
    .filter(m=>!(m.role==="user"&&m.content===latest) &&
      !(m.role==="assistant"&&/^(?:Ошибка Claude:|Ответ остановлен\.|Ошибка Ollama:|Отправка Batch:|Batch не запущен:)/.test(m.content)))
    .map(m=>({role:m.role,content:m.content}));
  return [...(projectInstructions?[{role:"system",content:projectInstructions}]:[]),
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
const safeWorkerEndpoint=(value)=>{
  const endpoint=safeEndpoint(value);
  if(!endpoint)return null;
  const url=new URL(endpoint);
  if(url.protocol!=="https:" && !["localhost","127.0.0.1","[::1]"].includes(url.hostname))return null;
  return endpoint;
};
// The Pages-hosted test uses a same-origin Function so the browser never
// calls a cross-origin Worker directly. The Function forwards only via
// Cloudflare Service binding, and the Worker checks the Firebase token.
function claudeGateway(savedUrl){
  const host=location.hostname.toLowerCase();
  if (host==="freitag-ai-test.pages.dev" ||
      /^[a-z0-9-]+\.freitag-ai-test\.pages\.dev$/.test(host))
    return location.origin+"/api/freitag";
  return safeWorkerEndpoint(savedUrl);
}
async function probeLocalConnection(){
  if(["modelproxy","bothub","apimira"].includes(state.settings.provider)){
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
  if(["modelproxy","bothub","apimira"].includes($("#f-provider")?.value||state.settings.provider)){
    const gateway=claudeGateway($("#f-worker")?.value||state.settings.workerUrl);
    if(!gateway)return notice("Укажи HTTPS-адрес личного Cloudflare Worker.");
    try{
      const response=await fetch(gateway+"/health",{cache:"no-store"});
      if(!response.ok)throw Error("HTTP "+response.status);
      const data=await response.json();
      if(data.provider!=="ModelProxy"||data.model!=="claude-opus-5-5"||data.chapterProtocol!==2)
        throw Error("На сервере прежняя версия шлюза. Обнови Worker без платных запросов.");
      const chosen=$("#f-provider")?.value||state.settings.provider;
      if(!data.ok || (chosen==="modelproxy"?!data.configured:chosen==="apimira"?!data.apimiraConfigured:!data.bothubConfigured))
        throw Error(chosen==="bothub"?"BotHub пока не подключен: проверь настройки владельца и BOTHUB_API_KEY.":chosen==="apimira"?"ApiMira пока не подключена: проверь настройки владельца и APIMIRA_API_KEY.":"ModelProxy пока не подключен: проверь настройки владельца и MODELPROXY_API_KEY.");
      let info;
      if(chosen==="bothub"||chosen==="apimira"){
        const model=chosen==="apimira"?"anthropic/claude-opus-5.5":($("#f-bothub-model")?.value||activeBotHubModel());
        const token=await master.idToken();
        const check=await fetch(gateway+"/preflight?provider="+chosen+"&model="+encodeURIComponent(model),{
          headers:{"Authorization":"Bearer "+token},cache:"no-store"
        });
        info=await check.json().catch(()=>({}));
        if(!check.ok||!info.ok)throw Error(info.error||info.message||"Модель недоступна.");
      }
      // Check the REAL MCP server, not the mere existence of a KV binding.
      const token=await master.idToken();
      const mcpRes=await fetch(gateway+"/mcp-tools",{
        headers:{"Authorization":"Bearer "+token},cache:"no-store"
      });
      const mcpInfo=await mcpRes.json().catch(()=>({}));
      if(!mcpRes.ok || !mcpInfo.ok)
        throw Error(mcpInfo.error||"Прямое MCP-подключение не работает.");
      connectOk=true;
      connectText="Мастерская MCP · "+mcpInfo.toolCount+" инструментов · "+activeProviderLabel();
      const status=$("#f-test-status");
      const money=chosen==="apimira"&&typeof info?.balanceUsd==="number"?
        " Баланс ApiMira: $"+info.balanceUsd.toFixed(4)+
        (info.balanceUsd===0?" — средств для платной главы нет.":"")+
        " Для длинной главы сервис временно резервирует стоимость входного текста и выбранного лимита ответа.":"";
      if(status)status.textContent=(info?"Модель есть в каталоге. ":"")+"MCP Мастерской подключен напрямую: "+
        mcpInfo.toolCount+" инструментов (книги, маркетинг, доходы, Директ, Метрика). "+
        "Проверка не выполняет платную генерацию."+money;
      notice("Защищенный шлюз найден. Оплата за проверку соединения не списывается.");
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
  if(isSimpleGreeting(text))return notice("Для Batch требуется задание на главу.");
  if(chat()?.batch?.batchId && !["completed","failed","cancelled","expired"].includes(chat().batch.status))
    return notice("В этом чате уже ожидается результат Batch. Проверь готовность главы.");
  if(state.settings.provider!=="bothub"||activeBotHubModel()!=="claude-opus-5.5")
    return notice("Batch-глава поддерживается для Claude Opus 5.5 через BotHub.");
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
        mode:"draft",messages,bookId:p.masterBookId||null,
        outputTokenLimit:Number(state.settings.sceneOutputTokens)||14000})
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
async function sendMessage(text){
  if(busy||preparingPaid||!text.trim())return;
  const provider=state.settings.provider, selectedModel=activeBotHubModel();
  const outputLimit=Number(state.settings.sceneOutputTokens)||14000;
  const isPaidProvider=["modelproxy","bothub","apimira"].includes(provider);
  const endpoint=safeEndpoint(state.settings.endpoint);
  const gateway=claudeGateway(state.settings.workerUrl);
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
      if(selectedChat!==draftKey() || provider!==state.settings.provider || selectedModel!==activeBotHubModel())
        return notice("Выбор чата или модели изменился. Отправь задание из нужного чата.");
    }catch(e){return notice("Авторизация: "+e.message);}
    finally{preparingPaid=false;}
  }
  const previousDraft=draftKey();
  const c=ensureChat(),msg=text;
  if(c.projectId && !c.mode) c.mode="draft";
  const lightweight=isSimpleGreeting(msg);
  const requestMode=lightweight?"dialog":(c.mode||"dialog");
  clearTimeout(draftSaveTimer);
  if(state.drafts){
    delete state.drafts[previousDraft];
    delete state.drafts[draftKey()];
  }
  c.messages.push({role:"user",content:msg,at:stamp()});
  if(c.title==="Новый чат")c.title=msg.slice(0,65);
  c.updated=stamp();
  // Block a second Send while IndexedDB persists the first request.
  busy=true;
  const messages=isPaidProvider?(lightweight?[{role:"user",content:msg}]:modelproxyMessages(c)):buildMessages(c);
  const assistant={role:"assistant",provider:isPaidProvider?(provider==="bothub"?activeClaudeName():"Claude Opus 5.5"):"Qwen",content:"",at:stamp()};
  const bookId=lightweight?null:(project(c.projectId)?.masterBookId||null);
  await save();render();
  c.messages.push(assistant);
  const el=document.createElement("div");el.className="f-msg assistant";
  el.innerHTML='<span class="f-speaker">'+(isPaidProvider?esc(assistant.provider):"Freitag AI")+'</span><div class="f-msg-text pending">Генерация ответа…</div>';
  $("#f-messages")?.append(el);const target=el.querySelector(".f-msg-text");
  currentController=new AbortController();
  let checkpointTimer=null,firstFragment=true;
  if(isPaidProvider)assistant.receiving=true;
  try{
    const res=isPaidProvider?await fetch(gateway+"/chat",{
      method:"POST",
      headers:{"Authorization":"Bearer "+idToken,"Content-Type":"application/json"},
      body:JSON.stringify({provider,model:provider==="bothub"?selectedModel:undefined,messages,mode:requestMode,outputTokenLimit:requestMode==="draft"?outputLimit:undefined,bookId,sourceRevision}),
      signal:currentController.signal
    }):await ollamaRequest(endpoint,"/api/chat",{method:"POST",headers:{"Content-Type":"application/json"},
      body:JSON.stringify({model:state.settings.model,stream:true,messages,think:false,keep_alive:"5m",
        options:{num_ctx:Number(state.settings.context)||4096,num_predict:(WRITING_MODES[c.mode]||WRITING_MODES.dialog).maxTokens}}),
      signal:currentController.signal});
    if(!res.ok){
      const error=await res.json().catch(()=>null);
      throw Error(typeof error?.error==="string"?error.error:"Сервер вернул HTTP "+res.status+".");
    }
    if(!res.body)throw Error("Сервер не вернул поток ответа");
    const reader=res.body.getReader(),decoder=new TextDecoder();let pending="",streamFinished=false,finishReason="";
    const consume=(line)=>{
      if(!line.trim())return;
      if(isPaidProvider){
        if(!line.startsWith("data:"))return;
        const data=line.slice(5).trim();
        if(data==="[DONE]"){streamFinished=true;return true;}
        let obj;try{obj=JSON.parse(data);}catch{throw Error("Поток содержит поврежденный фрагмент.");}
        if(obj?.error)throw Error("Провайдер сообщил об ошибке в потоке. Проверь историю запроса.");
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
        target.classList.remove("pending");target.textContent=assistant.content;
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
    if(isPaidProvider&&(!streamFinished||(finishReason&&finishReason!=="stop"))){
      // Preserve the paid partial chapter rather than pretending that a broken
      // stream or max_tokens cutoff is a complete manuscript.
      assistant.content+="\n\n[Генерация не завершена: "+(finishReason==="length"?"достигнут лимит длины ответа.":finishReason?"провайдер остановил выдачу.":"поток прервался до подтверждения завершения.")+" Уже полученный текст сохранен. Не отправляй запрос повторно автоматически.]";
    }
    connectOk=true;connectText=isPaidProvider?activeProviderLabel()+" подключен":"Ollama доступна";
  }catch(e){
    currentController.abort();
    const prefix=e.name==="AbortError"?"Ответ остановлен.":(isPaidProvider?"Ошибка Claude: ":"Ошибка Ollama: ")+e.message;
    assistant.content=assistant.content?(assistant.content+"\n\n["+prefix+"]"):prefix;
    target.textContent=assistant.content;target.classList.remove("pending");
    connectOk=false;connectText=isPaidProvider?"Ошибка Claude":"Нет соединения";
  }finally{
    clearTimeout(checkpointTimer);delete assistant.receiving;
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
  const nav=e.target.closest("[data-nav]");if(nav){tab=nav.dataset.nav;if(tab==="projects")projectHomeId=null;render();return;}
  const b=e.target.closest("[data-action]");if(!b)return;
  const a=b.dataset.action,id=b.dataset.id;
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
  if(a==="projects-back"){projectHomeId=null;tab="projects";render();}
  if(a==="new-project-chat"){state.activeProjectId=id;state.activeChatId=null;projectHomeId=null;pendingMode=null;await save();tab="chat";render();$("#f-message-input")?.focus();}
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
  if(a==="delete-chat"){const c=chat();if(!c||!confirm("Удалить этот чат?"))return;if(state.drafts)delete state.drafts["chat:"+c.id];state.chats=state.chats.filter(x=>x.id!==c.id);state.activeChatId=null;await save();render();}
  if(a==="copy-answer"){
    const message=chat()?.messages[Number(b.dataset.i)];
    if(message?.role!=="assistant" || !message.content)return;
    try{await navigator.clipboard.writeText(message.content);notice("Ответ скопирован.");}
    catch{notice("Не удалось скопировать. Выдели текст ответа вручную.");}
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
    if(!["ollama","modelproxy","bothub","apimira"].includes(provider))return notice("Неверный провайдер.");
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
    connectOk=false;connectText=provider==="modelproxy"?"ModelProxy Opus: проверь шлюз в настройках":provider==="bothub"?"BotHub: проверь шлюз в настройках":provider==="apimira"?"ApiMira: проверь шлюз в настройках":"Ollama: проверь соединение";
    await save();render();notice("Настройки сохранены.");}
});
document.addEventListener("change",async(e)=>{
  if(e.target.id==="f-quick-model"){
    const val=String(e.target.value||"");
    const provider=val.startsWith("bothub:")?"bothub":val;
    if(!["bothub","apimira","modelproxy","ollama"].includes(provider))return;
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
    if(!["ollama","modelproxy","bothub","apimira"].includes(provider) ||
       !["claude-sonnet-5.5","claude-opus-5.5"].includes(model))return;
    state.settings.provider=provider;state.settings.bothubModel=model;
    connectOk=false;connectText=activeProviderLabel()+" · не проверено";
    await save();
    const row=$("#f-bothub-model-row");if(row)row.hidden=provider!=="bothub";
    const status=$("#f-test-status");if(status)status.textContent="Модель сохранена. Проверка не запускает платную генерацию.";
    renderHeader();
    return;
  }
  if(e.target.id==="f-writing-mode"){
    if(!WRITING_MODES[e.target.value])return;
    const c=chat();if(c){c.mode=e.target.value;await save();}else pendingMode=e.target.value;
    const lengthRow=$("#f-chapter-limit-wrap");if(lengthRow)lengthRow.hidden=e.target.value!=="draft";
    return;
  }
  if(e.target.id==="f-chapter-limit"){
    const limit=Number(e.target.value);
    if(![4500,9000,14000].includes(limit))return;
    state.settings.sceneOutputTokens=limit;
    await save();return;
  }
  if(e.target.id==="f-sidebar-project"||e.target.id==="f-chat-project"||e.target.id==="f-doc-project"){
    state.activeProjectId=e.target.value||null;state.activeChatId=null;pendingMode=null;await save();render();return;
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
document.addEventListener("input",e=>{
  if(e.target.id==="f-message-input"){
    resizeChatInput(e.target);
    rememberDraft(e.target.value);
  }
});
document.addEventListener("keydown",e=>{
  if(e.target.id==="f-message-input"&&e.key==="Enter"&&(e.ctrlKey||e.metaKey)&&!e.isComposing){
    e.preventDefault();if(!busy)e.target.closest("form")?.requestSubmit();
  }
});
(async()=>{
  try{db=await openDb();const loaded=await getDb();if(loaded&&Array.isArray(loaded.projects)&&Array.isArray(loaded.chats))state={...blank(),...loaded,settings:{...blank().settings,...loaded.settings}};
    // Migrate existing test settings: Polza is no longer available.
    if(state.settings.provider==="polza")state.settings.provider="modelproxy";}
  catch(e){$("#panel").innerHTML=empty("Хранилище недоступно","Разреши браузеру сохранять данные сайта: "+e.message);return;}
  state.settings.bothubModel=["claude-sonnet-5.5","claude-opus-5.5"].includes(state.settings.bothubModel)?
    state.settings.bothubModel:"claude-sonnet-5.5";
  state.feedback=Array.isArray(state.feedback)?state.feedback:[];
  state.drafts=state.drafts&&typeof state.drafts==="object"&&!Array.isArray(state.drafts)?state.drafts:{};
  render();
  // Reuse an existing Firebase session and silently load the books list.
  // This never starts Google Drive OAuth and does not send a paid model request.
  master.init().then(async()=>{if(master.user){await master.refresh();if(tab==="projects")render();}}).catch(()=>{});
  // Не требуем от пользователя вручную проверять уже настроенную Ollama
  // при каждом обновлении страницы. Это тихая проверка без всплывающих окон.
  probeLocalConnection().catch(()=>{});
})();
