// Pinterest: экран независим от главных данных и запускается только после открытия вкладки.
import { esc, copyRich } from '../../../js/ui.js';
import { catalogOf, nextIdeas, trackedLink, issues, agentPrompt, parseAgentIdeas, imageFormat, snapshotPayload } from '../pinterest.js';
import { readCloud, writeCloud, getImage, putImage, deleteImage, inspectImage } from '../pinterest-storage.js';
const states=new Map();
const checks=['Бизнес-аккаунт','Подтвержденный домен','Название и описание профиля','Тематические доски','Проверка ссылок на книги'];
const fields=[['title','Заголовок',100],['description','SEO-описание',500,true],['board','Доска',100],['keywords','Ключевые фразы',500],['alt','Alt-текст по готовому изображению',500,true],['link','HTTPS-ссылка на книгу',1000],['prompt','Промт для визуала',3000,true]];
const btn=(act,label,v='')=>'<button type="button" data-pin-act="'+act+'" data-v="'+esc(v)+'">'+esc(label)+'</button>';
const field=(name,label,max,value,multi)=>'<label style="display:block;margin:8px 0">'+esc(label)+(multi?'<textarea name="'+name+'" maxlength="'+max+'" rows="3">'+esc(value||'')+'</textarea>':'<input name="'+name+'" maxlength="'+max+'" value="'+esc(value||'')+'">')+'</label>';
const statusText={draft:'Черновик',ready:'Готов к ручной публикации',published:'Отмечен опубликованным'};
const bundle=p=>[p.title,p.description,'Доска: '+p.board,'Ключевые слова: '+p.keywords,'Alt: '+p.alt,'Ссылка: '+trackedLink(p.link,p.id),'Промт: '+p.prompt].join('\n\n');

export function mountPinterest(root,a){
 const account=a.store.user?.uid||'local-demo',key='freitag.pinterest.v1.'+account;
 let s=states.get(account);
 if(!s){
   s={pins:[],done:[],ideas:[],revision:0,tab:'ideas',editing:null,focus:'',raw:'',message:'',problem:'',busy:false,dirty:false,file:null,previewUrl:null};
   try{const data=JSON.parse(localStorage.getItem(key)||'{}');for(const k of ['pins','done','ideas'])if(Array.isArray(data[k]))s[k]=data[k];s.revision=Number.isInteger(data.revision)?data.revision:0;}
   catch{s.problem='Локальный архив поврежден. Не перезаписываю его.';}
   states.set(account,s);
 }
 // Смена аккаунта не переносит черновики и изображения между аккаунтами.
 s.root=root;s.a=a;
 const books=()=>catalogOf(s.a.ctx().wbooks||[]);
 const author=()=>s.a.ctx().settings?.pseudonym||'Лана Фрейтаг';
 const active=()=>s.a.store.user?.uid===account||account==='local-demo'&&!s.a.store.user?.uid;
 const save=()=>{if(s.problem)return false;try{localStorage.setItem(key,JSON.stringify({...snapshotPayload(s.pins,s.done,s.ideas),revision:s.revision}));return true;}catch(e){s.problem='Не удалось сохранить локальный архив: '+e.message;return false;}};
 const setMessage=(m)=>{s.message=m;render();};
 const clearPreview=()=>{if(s.previewUrl)URL.revokeObjectURL(s.previewUrl);s.previewUrl=null;s.file=null;};
 const currentIdeas=()=>[...s.ideas,...nextIdeas(books(),s.pins,author())].slice(0,20);
 const edit=(p={})=>{clearPreview();s.editing={...p};s.tab='pins';};
 const leave=()=>!s.editing||!s.dirty||window.confirm('Закрыть несохраненную карточку?');
 const render=()=>{
   const r=s.root;if(!r?.isConnected||!active())return;
   const tabs=[['ideas','Рекомендации'],['pins','Студия · '+s.pins.length],['profile','Профиль и доски'],['stats','Аналитика']];
   r.innerHTML='<div class="row between"><h2 style="margin:0">Pinterest</h2><span class="small muted">Подготовка · аккаунт не подключен</span></div><p class="small muted">Оригиналы изображений — в этом браузере. Тексты можно отдельно синхронизировать с личным облаком. Публикация пока ручная.</p>'+
     (s.problem?'<p class="down" role="alert">'+esc(s.problem)+'</p>':'')+
     (s.message?'<p role="status" class="small">'+esc(s.message)+'</p>':'')+
     '<div class="chips">'+tabs.map(([id,t])=>'<button type="button" class="chip'+(s.tab===id?' on':'')+'" data-pin-act="tab" data-v="'+id+'">'+esc(t)+'</button>').join('')+'</div>';
   if(s.tab==='ideas'){
     r.insertAdjacentHTML('beforeend','<h3>ИИ-маркетолог</h3><p class="small muted">Бесплатный режим: скопируйте запрос в ChatGPT или Claude и вставьте JSON-ответ сюда. Передаются только названия, жанры, теги и история пинов, без рукописей.</p>'+field('focus','Фокус недели',600,s.focus,true)+btn('agent','Скопировать запрос для ИИ')+field('raw','Ответ ИИ (JSON)',60000,s.raw,true)+btn('import','Добавить рекомендации')+'<h3>Что генерировать</h3><p class="small muted">Без живой статистики это гипотезы. ИИ-советы требуют проверки.</p>'+
       (currentIdeas().map((p,i)=>'<div class="item" style="padding:12px 0;border-top:1px solid var(--line,#ddd)"><span class="small muted">'+esc(books().find(b=>b.id===p.bookId)?.title||'Книга')+' · '+esc(p.source==='ai'?'ИИ':'Гипотеза')+'</span><h3>'+esc(p.title)+'</h3><p>'+esc(p.reason)+'</p><p class="small">'+esc(p.prompt)+'</p><div class="row">'+btn('idea','В студию',i)+btn('prompt','Копировать промт',i)+'</div></div>').join('')||'<p>Пока нет рекомендаций.</p>'));
   }else if(s.tab==='pins'){
     r.insertAdjacentHTML('beforeend','<div class="row">'+btn('new','+ Пин')+btn('export','Экспорт JSON')+btn('cloudSave','Сохранить в облако')+btn('cloudLoad','Загрузить из облака')+'</div><p class="small muted">Версия облака: '+s.revision+' · Готовых: '+s.pins.filter(p=>p.status==='ready').length+'</p>');
     if(s.editing){const p=s.editing;
       r.insertAdjacentHTML('beforeend','<form data-pin-form><h3>Карточка пина</h3><label>Книга<select name="bookId"><option value="">Выбрать</option>'+books().map(b=>'<option value="'+esc(b.id)+'"'+(p.bookId===b.id?' selected':'')+'>'+esc(b.title)+'</option>').join('')+'</select></label>'+
        fields.map(([n,l,m,t])=>field(n,l,m,p[n],t)).join('')+
        '<label>Изображение (JPG, PNG, WebP)<input type="file" accept="image/jpeg,image/png,image/webp" data-pin-file></label>'+
        '<p class="small">'+esc(p.imageNote||'Визуал не добавлен')+(p.imageWidth?' · '+p.imageWidth+' × '+p.imageHeight+' · '+(imageFormat(p.imageWidth,p.imageHeight)==='recommended'?'2:3':'рекомендуется 2:3'):'')+'</p>'+
        (s.previewUrl?'<img alt="Предпросмотр пина" src="'+esc(s.previewUrl)+'" style="display:block;max-width:220px;max-height:330px;object-fit:contain;margin:10px 0">':'')+
        field('scheduledDate','Плановая дата (ГГГГ-ММ-ДД)',10,p.scheduledDate,false)+
        '<label><input type="checkbox" name="reviewed"'+(p.reviewed?' checked':'')+'> Проверены визуал, права, спойлеры и маркировка ИИ</label><div class="row"><button class="primary" type="submit">Сохранить</button>'+btn('cancel','Отмена')+'</div></form>');
     }
     r.insertAdjacentHTML('beforeend',s.pins.map(p=>'<div class="item" style="padding:12px 0;border-top:1px solid var(--line,#ddd)"><span class="small muted">'+esc(statusText[p.status]||statusText.draft)+' '+esc(p.scheduledDate||'')+'</span><h3>'+esc(p.title||'Без заголовка')+'</h3><p class="small">'+esc(p.board||'')+'</p>'+(issues(p).length?'<p class="small muted">Осталось: '+esc(issues(p).join('; '))+'</p>':'')+'<div class="row">'+btn('edit','Изменить',p.id)+btn('copy','Копировать пакет',p.id)+btn('download','Скачать оригинал',p.id)+(p.status==='ready'?btn('published','Отметить опубликованным',p.id):'')+btn('delete','Удалить',p.id)+'</div></div>').join('')||'<p>Черновиков пока нет.</p>');
   }else if(s.tab==='profile'){
     r.insertAdjacentHTML('beforeend','<h3>Готовность профиля · '+s.done.length+'/'+checks.length+'</h3><p class="small muted">Ручной чек-лист, не автоматический аудит.</p>'+checks.map(x=>'<label style="display:block;margin:10px 0"><input type="checkbox" data-pin-check="'+esc(x)+'"'+(s.done.includes(x)?' checked':'')+'> '+esc(x)+'</label>').join('')+'<h3>Название</h3><p>'+esc(author())+' | любовные романы</p><h3>Описание</h3><p>Атмосферные любовные романы, книжная эстетика, сложные отношения и романтические истории. Найдите свою следующую книгу.</p><h3>Доски</h3><p>Атмосферные любовные романы · Романтический саспенс · Спортивные любовные романы · Книжные цитаты · Книги '+esc(author())+'</p>');
   }else{
     r.insertAdjacentHTML('beforeend','<h3>Результаты пинов</h3><p class="small muted">Ручной ввод накопительных показателей из Pinterest. Нет автоматического доступа к статистике.</p>'+s.pins.filter(p=>p.status==='published').map(p=>'<form data-pin-metrics="'+esc(p.id)+'" style="padding:12px 0;border-top:1px solid var(--line,#ddd)"><b>'+esc(p.title)+'</b>'+[['impressions','Показы'],['saves','Сохранения'],['clicks','Внешние переходы']].map(([k,t])=>'<label style="display:block">'+t+'<input name="'+k+'" type="number" min="0" step="1" max="1000000000" value="'+esc(p.metrics?.[k]??'')+'"></label>').join('')+'<p class="small">CTR внешних переходов: '+(p.metrics?.impressions>0&&p.metrics.clicks!=null?(100*p.metrics.clicks/p.metrics.impressions).toFixed(2)+'%':'нет данных')+'</p><button type="submit">Сохранить показатели</button></form>').join(''));
   }
 };
 const guarded=async(fn)=>{if(s.busy||!active())return;s.busy=true;try{await fn();}catch(e){s.message=e.message||String(e);}finally{s.busy=false;render();}};
 const copy=async(v)=>{s.message=await copyRich(v)?'Скопировано':'Не удалось скопировать';render();};
 root.addEventListener('input',e=>{
   const el=e.target;if(el.name==='focus'||el.name==='raw'){s[el.name]=el.value;return;}
   if(!el.closest('[data-pin-form]')||!s.editing||!el.name)return;
   s.editing[el.name]=el.type==='checkbox'?el.checked:el.value;s.dirty=true;
 });
 root.addEventListener('change',e=>{
   const el=e.target;
   if(el.dataset.pinCheck&&checks.includes(el.dataset.pinCheck)){s.done=el.checked?[...new Set([...s.done,el.dataset.pinCheck])]:s.done.filter(x=>x!==el.dataset.pinCheck);save();render();return;}
   if(!el.matches('[data-pin-file]')||!s.editing||!el.files?.[0])return;
   const p=s.editing,file=el.files[0];
   guarded(async()=>{const meta=await inspectImage(file);if(s.editing!==p||!active())return;clearPreview();Object.assign(p,meta,{reviewed:false});s.file=file;s.previewUrl=URL.createObjectURL(file);s.dirty=true;});
 });
 root.addEventListener('click',e=>{
   const el=e.target.closest('[data-pin-act]');if(!el||s.busy)return;
   const {pinAct:act,v}=el.dataset,p=s.pins.find(x=>x.id===v),ideas=currentIdeas();
   if(act==='agent')return copy(agentPrompt(books(),s.pins,author(),s.focus));
   if(act==='prompt'&&ideas[Number(v)])return copy(ideas[Number(v)].prompt);
   if(act==='copy'&&p)return copy(bundle(p));
   if(act==='export')return copy(JSON.stringify(snapshotPayload(s.pins,s.done,s.ideas),null,2));
   guarded(async()=>{
     if(act==='import'){s.ideas=parseAgentIdeas(s.raw,books());s.raw='';save();s.message='Рекомендации ИИ добавлены';}
     if(act==='tab'&&leave()){clearPreview();s.editing=null;s.dirty=false;s.tab=v;}
     if(act==='idea'&&ideas[Number(v)]&&leave()){edit(ideas[Number(v)]);s.dirty=false;}
     if(act==='new'&&leave()){edit();s.dirty=false;}
     if(act==='cancel'){clearPreview();s.editing=null;s.dirty=false;}
     if(act==='edit'&&p&&leave()){edit(p);s.dirty=false;const file=await getImage(account,p.id);if(file&&active())s.previewUrl=URL.createObjectURL(file);}
     if(act==='download'&&p){const file=await getImage(account,p.id);if(!file)throw Error('Оригинал отсутствует на этом устройстве');const url=URL.createObjectURL(file),link=document.createElement('a');link.href=url;link.download=p.imageNote||'pin.jpg';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
     if(act==='published'&&p?.status==='ready'&&window.confirm('Пин уже опубликован вручную?')){p.status='published';save();}
     if(act==='delete'&&p&&window.confirm('Удалить пин и его локальное изображение?')){await deleteImage(account,p.id);s.pins=s.pins.filter(x=>x.id!==p.id);if(s.editing?.id===p.id){clearPreview();s.editing=null;}save();}
     if(act==='cloudSave'){if(s.editing)throw Error('Сначала сохраните карточку');s.revision=await writeCloud(a,s.revision,snapshotPayload(s.pins,s.done,s.ideas));save();s.message='Облачная версия '+s.revision+' сохранена';}
     if(act==='cloudLoad'){if(s.editing)throw Error('Сначала сохраните карточку');const d=await readCloud(a);if(!active())return;if(!d.revision)throw Error('Облачного архива пока нет');if(!window.confirm('Заменить локальные тексты облачной версией? Сначала можно экспортировать JSON. Изображения не затрагиваются.'))return;for(const k of ['pins','done','ideas'])s[k]=Array.isArray(d[k])?d[k]:[];s.revision=d.revision;save();s.message='Облачная версия загружена';}
   });
 });
 root.addEventListener('submit',e=>{
   const f=e.target;if(!f.matches('[data-pin-form],[data-pin-metrics]'))return;e.preventDefault();
   guarded(async()=>{
     const fd=new FormData(f);
     if(f.matches('[data-pin-metrics]')){const p=s.pins.find(x=>x.id===f.dataset.pinMetrics);if(!p)return;p.metrics=Object.fromEntries(['impressions','saves','clicks'].map(k=>{const v=String(fd.get(k)||'');return [k,v===''?null:Math.max(0,Number(v)||0)];}));save();return;}
     if(!s.editing)return;const p={...s.editing};
     for(const n of ['bookId',...fields.map(x=>x[0]),'scheduledDate'])p[n]=String(fd.get(n)||'').trim();
     if(!books().some(b=>b.id===p.bookId))throw Error('Выберите книгу');
     p.reviewed=fd.has('reviewed');p.id=p.id||crypto.randomUUID();if(s.file)await putImage(account,p.id,s.file);
     if(!active())return;
     p.status=issues(p).length?'draft':p.status==='published'?'published':'ready';
     s.pins=[...s.pins.filter(x=>x.id!==p.id),p];s.ideas=s.ideas.filter(x=>!(x.bookId===p.bookId&&x.title===p.title));clearPreview();s.editing=null;s.dirty=false;save();s.message='Карточка сохранена';
   });
 });
 render();
}
