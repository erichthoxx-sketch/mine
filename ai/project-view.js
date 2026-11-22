// Project overview. Everything editable here is stored only in Freitag AI.
// The original manuscript/legend belongs to Masterskaya, never edited here.
const esc=s=>String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
export function projectHomeHtml(p,chats,docs,userInstruction){
  const history=chats.filter(x=>x.projectId===p.id).sort((a,b)=>String(b.updated||"").localeCompare(String(a.updated||""))).slice(0,10);
  const materials=docs.filter(d=>d.projectId===p.id);
  return '<div class="f-content f-project-home">'+
    '<button type="button" class="f-project-back" data-action="projects-back">← Все проекты</button>'+
    '<div class="f-project-overview">'+
      '<div><span class="f-eyebrow">ПРОЕКТ КНИГИ</span><h1 class="f-title">'+esc(p.name)+'</h1>'+
      (p.description?'<p class="f-subtitle">'+esc(p.description)+'</p>':"")+'</div>'+
      '<button type="button" class="f-btn primary" data-action="new-project-chat" data-id="'+esc(p.id)+'">＋ Новый чат</button>'+
    '</div>'+
    '<div class="f-project-status"><span class="f-status-pip"></span>'+
      (p.masterBookId?'Книга связана с Мастерской · MCP вызывается автоматически':'Локальный проект · подключи книгу через «Мастерскую»')+
      ' · '+history.length+' последних чатов</div>'+
    '<form id="f-project-instructions" data-project-id="'+esc(p.id)+'" class="f-project-editor">'+
      '<div><h2>Инструкция проекта</h2><p class="f-muted">Вставь свой мастер-промпт целиком и сохрани один раз. Он будет применяться ко всем новым чатам этого романа — как в Claude Projects. Ничего разделять не нужно.</p></div>'+
      '<label class="f-label" for="f-project-instruction">Твоя постоянная инструкция</label>'+
      '<textarea id="f-project-instruction" name="instruction" class="f-textarea f-project-prompt" placeholder="Вставь сюда свой мастер-промпт целиком, без переработки и сокращений.">\n'+esc(userInstruction(p.instruction))+'</textarea>'+
      '<details class="f-project-options"><summary>Мои дополнения к канону, голосу и текущей сцене</summary>'+
        '<label class="f-label" for="f-project-voice">Голос и стиль</label><textarea id="f-project-voice" name="voice" class="f-textarea">\n'+esc(p.voice||"")+'</textarea>'+
        '<label class="f-label" for="f-project-canon">Дополнительные факты канона</label><textarea id="f-project-canon" name="canon" class="f-textarea">\n'+esc(p.canon||"")+'</textarea>'+
        '<label class="f-label" for="f-project-scene">Текущая сцена</label><textarea id="f-project-scene" name="scene" class="f-textarea">\n'+esc(p.scene||"")+'</textarea>'+
      '</details>'+
      '<div class="f-row"><button class="f-btn primary" type="submit">Сохранить инструкции</button>'+
        '<button class="f-btn" data-action="edit-project" data-id="'+esc(p.id)+'" type="button">Название и описание</button></div>'+
    '</form>'+
    '<section class="f-project-source"><div class="f-spread"><div><h2>Рукопись и материалы</h2>'+
      '<p class="f-muted">'+(p.masterBookId?'Opus читает канон и главы напрямую из MCP Мастерской. Используется последний доступный снимок источника.':
      'Пока проект без исходной рукописи. Открой «Все проекты» для подключения.')+'</p></div>'+
      (p.masterBookId?'<button class="f-btn" data-action="sync-current-book" data-id="'+esc(p.id)+'" type="button">Обновить Google Docs</button>':"")+
    '</div>'+
    '<p class="f-muted">Google не запрашивает повторную авторизацию при каждом сообщении. Для переноса новых правок из Google Docs есть отдельное обновление.</p>'+
    (p.masterSyncedAt?'<p class="f-muted">Последняя синхронизация данных проекта: '+esc(new Date(p.masterSyncedAt).toLocaleString("ru-RU"))+'</p>':"")+
    (materials.length?'<p class="f-muted">Локальные материалы: '+materials.map(m=>esc(m.name)).join(", ")+'</p>':"")+
    '</section>'+
    '<section class="f-project-recent"><h2>Чаты проекта</h2>'+
      (history.length?'<ul class="f-list">'+history.map(c=>'<li><button data-action="select-chat" data-id="'+esc(c.id)+'">'+esc(c.title)+'</button></li>').join("")+'</ul>':
      '<p class="f-muted">Новый проект — чатов пока нет.</p>')+
    '</section></div>';
}
