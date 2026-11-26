// Изолированная вкладка. В MVP храним только черновики в браузере, отдельно от Firestore.
import { esc, copyRich } from '../../../js/ui.js';
import { catalogOf, nextIdeas, trackedLink, issues } from '../pinterest.js';

const statusText = { draft: 'Черновик', ready: 'Готов к ручной публикации', published: 'Отмечен опубликованным' };
const field = (name, label, value, multi = false, max = 500) => '<label style="display:block;margin:8px 0">' + esc(label) + (multi
  ? '<textarea name="' + name + '" rows="3" maxlength="' + max + '">' + esc(value || '') + '</textarea>'
  : '<input name="' + name + '" maxlength="' + max + '" value="' + esc(value || '') + '">') + '</label>';
export function mountPinterest(root, a) {
  const c = a.ctx(), user = a.store.user, account = user?.uid;
  const key = account ? 'freitag.pinterest.v1.' + account : null;
  const books = catalogOf(c.wbooks || []);
  const author = c.settings?.pseudonym || 'Лана Фрейтаг';
  let pins = [], editing = null, problem = '', tab = 'ideas';
  const checks = ['Бизнес-аккаунт', 'Подтвержденный домен', 'Название и описание профиля', 'Тематические доски', 'Проверка ссылок на книги'];
  let done = [];
  try {
    if (!key) throw Error('Нет идентификатора аккаунта');
    const data = JSON.parse(localStorage.getItem(key) || '{}');
    if (Array.isArray(data.pins)) pins = data.pins.filter(p => p && typeof p.id === 'string');
    if (Array.isArray(data.done)) done = data.done.filter(x => checks.includes(x));
  } catch { problem = 'Хранилище недоступно или повреждено. Не перезаписываю данные. Можно копировать рекомендации.'; }
  const save = () => {
    if (problem) return false;
    try { localStorage.setItem(key, JSON.stringify({ pins, done })); return true; }
    catch { problem = 'Не удалось записать данные в браузер. Не закрывайте вкладку до копирования.'; return false; }
  };
  const btn = (act, label, value = '') => '<button type="button" data-pin-act="' + act + '" data-v="' + esc(value) + '">' + esc(label) + '</button>';
  const bundle = (p) => [p.title, p.description, 'Доска: ' + p.board, 'Ключевые слова: ' + p.keywords, 'Alt: ' + p.alt, 'Ссылка: ' + trackedLink(p.link, p.id), 'Визуал: ' + p.imageNote, 'Промт: ' + p.prompt].join('\n\n');
  const render = () => {
    const ideas = nextIdeas(books, pins, author);
    root.innerHTML = '<div class="row between"><h2 style="margin:0">Pinterest</h2><span class="small muted">Подготовка · без подключения аккаунта</span></div>' +
      '<p class="small muted">Черновики сохраняются только в этом браузере. Рекомендации основаны на жанрах и тегах книг, а не на живой статистике Pinterest. Ничего не публикуется автоматически.</p>' +
      (problem ? '<p class="down" role="alert">' + esc(problem) + '</p>' : '') +
      '<div class="chips">' + [['ideas','Рекомендации'],['pins','Студия и очередь ('+pins.length+')'],['profile','Профиль и доски']].map(([id,label]) => '<button type="button" class="chip'+(tab===id?' on':'')+'" data-pin-act="tab" data-v="'+id+'">'+esc(label)+'</button>').join('') + '</div>';
    if (tab === 'profile') {
      root.insertAdjacentHTML('beforeend', '<h3>Готовность профиля · ' + done.length + '/' + checks.length + '</h3>' +
        '<p class="small muted">Отметьте после проверки в Pinterest; это не автоматический аудит.</p>' +
        checks.map(x => '<label style="display:block;margin:10px 0"><input type="checkbox" data-pin-check="' + esc(x) + '"' + (done.includes(x) ? ' checked' : '') + '> ' + esc(x) + '</label>').join('') +
        '<h3>Предложение по профилю</h3><p><b>' + esc(author) + ' | любовные романы</b></p><p>Атмосферные любовные романы, книжная эстетика, сложные отношения и романтические истории. Найдите свою следующую книгу.</p>' +
        '<h3>Доски для старта</h3><p>Атмосферные любовные романы · Романтический саспенс · Спортивные любовные романы · Книжные цитаты · Книги ' + esc(author) + '</p>');
    } else if (tab === 'ideas') {
      root.insertAdjacentHTML('beforeend', '<p class="small muted">Стартовые гипотезы. Выберите идею, доработайте ее и подготовьте изображение.</p>' +
        (ideas.length ? ideas.map((p,i) => '<div class="item" style="margin:10px 0;padding:12px 0;border-top:1px solid var(--line,#ddd)"><div class="small muted">' + esc(books.find(b => b.id === p.bookId)?.title) + ' · ' + esc(p.kind) + '</div><h3>' + esc(p.title) + '</h3><p>' + esc(p.reason) + '</p><p class="small">' + esc(p.prompt) + '</p><div class="row">' + btn('idea','В студию',i) + btn('prompt','Копировать промт',i) + '</div></div>').join('') : '<p>Новых гипотез пока нет. Добавьте опубликованные книги и жанровые теги или создайте пин вручную.</p>'));
    } else {
      root.insertAdjacentHTML('beforeend','<div class="row">' + btn('new','+ Пин') + btn('export','Копировать всю очередь') + '</div><p class="small muted">Готовых: '+pins.filter(p=>p.status==='ready').length+' · Отмечено опубликованными: '+pins.filter(p=>p.status==='published').length+'</p>');
      if (editing) {
        const p = editing;
        root.insertAdjacentHTML('beforeend', '<form data-pin-form style="margin:12px 0"><h3>Карточка пина</h3><label>Книга<select name="bookId"><option value="">Выбрать</option>' + books.map(b=>'<option value="'+esc(b.id)+'"'+(b.id===p.bookId?' selected':'')+'>'+esc(b.title)+'</option>').join('')+'</select></label>' +
          field('title','Заголовок (до 100)',p.title,false,100)+field('description','SEO-описание (до 500)',p.description,true,500)+field('board','Доска',p.board)+field('keywords','Ключевые фразы',p.keywords)+field('alt','Alt-текст по готовому изображению',p.alt,true)+field('link','Ссылка на страницу книги (HTTPS)',p.link)+field('imageNote','Имя готового файла или пометка о визуале',p.imageNote)+field('prompt','Промт для визуала',p.prompt,true,3000)+
          '<label><input type="checkbox" name="reviewed" '+(p.reviewed?'checked':'')+'> Проверены визуал, права, спойлеры и маркировка ИИ</label><p class="small muted">UTM добавятся при копировании. Готовность не означает публикацию.</p><div class="row"><button class="primary" type="submit">Сохранить</button>'+btn('cancel','Отмена')+'</div></form>');
      }
      root.insertAdjacentHTML('beforeend', pins.map(p=>'<div class="item" style="margin:10px 0;padding:12px 0;border-top:1px solid var(--line,#ddd)"><div class="small muted">'+esc(statusText[p.status]||statusText.draft)+'</div><h3>'+esc(p.title || 'Без заголовка')+'</h3><p class="small">'+esc(p.board || 'Доска не выбрана')+'</p>'+(issues(p).length?'<p class="small muted">Осталось: '+esc(issues(p).join('; '))+'</p>':'')+'<div class="row">'+btn('edit','Изменить',p.id)+btn('copy','Копировать пакет',p.id)+(p.status==='ready'?btn('published','Отметить опубликованным',p.id):'')+btn('delete','Удалить',p.id)+'</div></div>').join('') || '<p class="muted">Черновиков пока нет.</p>');
    }
  };
  const copy = async text => {
    const ok = await copyRich(text);
    const msg = document.createElement('p'); msg.className = 'small'; msg.setAttribute('role','status');
    msg.textContent = ok ? 'Скопировано' : 'Не удалось скопировать'; root.prepend(msg);
  };
  root.addEventListener('click', async e => {
    const el = e.target.closest('[data-pin-act]'); if (!el || !root.contains(el)) return;
    const { pinAct: action, v } = el.dataset;
    const p = pins.find(x=>x.id===v);
    const ideas = nextIdeas(books,pins,author);
    if (action==='prompt' && ideas[Number(v)]) return copy(ideas[Number(v)].prompt);
    if (action==='copy' && p) return copy(bundle(p));
    if (action==='export') return copy(JSON.stringify(pins,null,2));
    if (action==='tab') { if(editing&&!window.confirm('Закрыть несохраненную карточку?')) return; tab=v;editing=null; }
    if (action==='idea' && ideas[Number(v)]) { editing={...ideas[Number(v)]};tab='pins'; }
    if (action==='new') { if(editing&&!window.confirm('Заменить несохраненную карточку?'))return;editing={}; }
    if (action==='cancel') editing=null;
    if (action==='edit'&&p) { if(editing&&!window.confirm('Заменить несохраненную карточку?'))return;editing={...p}; }
    if (action==='published'&&p&&p.status==='ready'&&window.confirm('Вы уже опубликовали этот пин вручную?')) { p.status='published';save(); }
    if (action==='delete'&&p&&window.confirm('Удалить этот черновик из локальной очереди?')) { pins=pins.filter(x=>x.id!==v);if(editing?.id===v)editing=null;save(); }
    render();
  });
  root.addEventListener('change',e=>{
    const key=e.target.dataset.pinCheck;if(!checks.includes(key))return;
    done=e.target.checked?[...new Set([...done,key])]:done.filter(x=>x!==key);save();render();
  });
  root.addEventListener('submit',e=>{
    if(!e.target.matches('[data-pin-form]'))return;e.preventDefault();
    const fd=new FormData(e.target), p={...editing};
    for(const name of ['bookId','title','description','board','keywords','alt','link','imageNote','prompt'])p[name]=String(fd.get(name)||'').trim();
    if(!books.some(b=>b.id===p.bookId)){window.alert('Выберите книгу');return;}
    p.reviewed=fd.has('reviewed');p.id=p.id||crypto.randomUUID();p.status=issues(p).length?'draft':'ready';
    pins=[...pins.filter(x=>x.id!==p.id),p];editing=null;save();render();
  });
  render();
}
