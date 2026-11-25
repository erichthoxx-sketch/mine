// Project overview. Everything editable here is stored only in Freitag AI.
// The original manuscript/legend belongs to Masterskaya, never edited here.
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
const workshopOrigin="https://erichthoxx-sketch.github.io";
export function projectHomeHtml(p,chats,docs,userInstruction,origin=""){
  const refreshInWorkshop=/^https:\/\/(?:[a-z0-9-]+\.)?freitag-ai-test\.pages\.dev$/i.test(origin);
  const bookUrl=workshopOrigin+"/mine/workshop/#/book/"+encodeURIComponent(p.masterBookId||"");
  const history=chats.filter(x=>x.projectId===p.id).sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||""))).slice(0,10);
  const materials=docs.filter(d=>d.projectId===p.id);
  const notes=Array.isArray(p.memoryNotes)?p.memoryNotes.slice().reverse():[];
  return '<div class="f-content f-project-home">'+
    '<button type="button" class="f-project-back" data-action="projects-back">← Все проекты</button>'+
    '<div class="f-project-overview">'+
      '<div><h1 class="f-title">'+esc(p.name)+'</h1>'+
      (p.description?'<p class="f-subtitle">'+esc(p.description)+'</p>':"")+'</div>'+
      '<button type="button" class="f-btn primary" data-action="new-project-chat" data-id="'+esc(p.id)+'">＋ Новый чат</button>'+
    '</div>'+
    '<div class="f-project-status"><span class="f-status-pip" aria-hidden="true"></span>'+
      (p.masterBookId?'Книга связана с Мастерской · MCP вызывается автоматически':'Локальный проект · подключи книгу через «Мастерскую»')+
    '</div><div class="f-project-grid">'+
    '<form id="f-project-instructions" data-project-id="'+esc(p.id)+'" class="f-project-editor">'+
      '<h2><label for="f-project-instruction">Инструкция проекта</label></h2>'+
      '<p class="f-muted">Сохраненный текст применяется в чатах этой книги.</p>'+
      '<textarea id="f-project-instruction" name="instruction" class="f-textarea f-project-prompt" placeholder="Вставь мастер-промпт целиком.">\n'+esc(userInstruction(p.instruction))+'</textarea>'+
      '<details class="f-project-options"><summary>Сюжетная карта</summary>'+
        '<label class="f-label" for="f-project-story-map">Хронология, арки, кто что знает и открытые линии</label>'+
        '<textarea id="f-project-story-map" name="storyMap" class="f-textarea" placeholder="Что уже произошло и что важно помнить дальше…">\n'+esc(p.storyMap||"")+'</textarea>'+
      '</details>'+
      '<details class="f-project-options"><summary>Мои дополнения к канону, голосу и текущей сцене</summary>'+
        '<label class="f-label" for="f-project-voice">Голос и стиль</label><textarea id="f-project-voice" name="voice" class="f-textarea">\n'+esc(p.voice||"")+'</textarea>'+
        '<label class="f-label" for="f-project-canon">Дополнительные факты канона</label><textarea id="f-project-canon" name="canon" class="f-textarea">\n'+esc(p.canon||"")+'</textarea>'+
        '<label class="f-label" for="f-project-scene">Текущая сцена</label><textarea id="f-project-scene" name="scene" class="f-textarea">\n'+esc(p.scene||"")+'</textarea>'+
      '</details>'+
      '<div class="f-row"><button class="f-btn primary" type="submit">Сохранить инструкции</button>'+
        '<button class="f-btn" data-action="edit-project" data-id="'+esc(p.id)+'" type="button">Название и описание</button></div>'+
    '</form>'+
    '<div class="f-project-reference"><section class="f-project-source"><h2>Рукопись и материалы</h2>'+
    (p.masterBookId?
      '<p class="f-muted">Для глав Freitag берёт канон и '+(p.manuscriptScope==="full"?'всю рукопись.':'ближайшие предыдущие главы с отрывками по заданию.')+' Выбор доступен в чате в меню «Ещё».</p>'+
      '<div class="f-source-actions"><a class="f-btn" href="'+bookUrl+'" target="_blank" rel="noopener noreferrer">'+(refreshInWorkshop?'Обновить рукопись в Мастерской ↗':'Открыть книгу в Мастерской ↗')+'</a>'+
      '<button class="f-btn" data-action="open-story-map" data-id="'+esc(p.id)+'" type="button">Карта романа</button>'+
      '<button class="f-btn" data-action="check-book-source" data-id="'+esc(p.id)+'" type="button">Проверить источник бесплатно</button>'+
      (refreshInWorkshop?'':'<button class="f-btn" data-action="sync-current-book" data-id="'+esc(p.id)+'" type="button">Обновить Google Docs</button>')+'</div>'+
      (refreshInWorkshop?'<p class="f-muted">В карточке книги нажми «Нейросеть» → «Обновить у нейросети». При первом подключении кнопка называется «Подключить книгу».</p>':'')+
      '<div id="f-book-check" class="f-book-check" role="status"></div>':
      '<p class="f-muted">Подключи рукопись из списка книг в Мастерской.</p>')+
    '<div class="f-source-actions"><button class="f-btn" data-action="open-project-materials" data-id="'+esc(p.id)+'" type="button">Материалы проекта'+
      (materials.length?' · '+materials.length.toLocaleString("ru-RU"):"")+'</button></div>'+
    '</section>'+
    '<section class="f-project-recent f-project-memory"><h2>Память проекта</h2>'+
      '<p class="f-muted">В чатах книги доступны твои решения, реплики и одобренные ответы. Материалы подбираются по заданию. Память хранится на этом устройстве, личная резервная копия настраивается в разделе «Настройки».</p>'+
      '<button type="button" class="f-btn" data-action="add-project-memory">Закрепить решение</button>'+
      '<button type="button" class="f-btn" data-action="project-handoff" data-id="'+esc(p.id)+'">Передать проект</button>'+
      (notes.length?'<ul class="f-memory-list">'+notes.map(note=>
        '<li><strong>'+esc(note.title)+'</strong>'+(Number.isSafeInteger(note.anchor?.chapter)?
          '<button class="f-inline-btn" type="button" data-action="open-story-map" data-id="'+esc(p.id)+'" data-chapter="'+note.anchor.chapter+'">Глава '+
            note.anchor.chapter+(note.anchor.scene?' · сцена '+esc(note.anchor.scene):'')+'</button>':'')+
          '<p>'+esc(String(note.text||"").slice(0,190))+(note.text?.length>190?"…":"")+'</p>'+
        '<div class="f-row"><button type="button" class="f-inline-btn" data-action="edit-project-memory" data-id="'+esc(note.id)+'">Изменить</button>'+
        '<button type="button" class="f-inline-btn" data-action="remove-project-memory" data-id="'+esc(note.id)+'">Убрать</button></div></li>').join("")+'</ul>':"")+
    '</section>'+
    '<section class="f-project-recent"><h2>Чаты проекта</h2>'+
      '<button class="f-btn" type="button" data-action="open-chapter-jobs">Фоновые главы</button>'+
      (history.length?'<ul class="f-list">'+history.map(c=>'<li><button data-action="select-chat" data-id="'+esc(c.id)+'">'+esc(c.title)+'</button></li>').join("")+'</ul>':
      '<p class="f-muted">Чатов пока нет.</p>')+
    '</section></div></div></div>';
}
