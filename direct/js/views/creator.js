// Создание черновика ЕПК с явным подтверждением каждого действия. Не запускает рекламу.
import { esc, acts, forms, toast, ask, N, opt } from '../../../js/ui.js';
import { rub } from '../../../js/format.js';
import { proxyVersion } from '../api.js';
import { creatorOf, validateCreator, campaignPayload, groupPayload, adPayload, keywordsPayload,
  addedId, createCampaign, pauseCampaign, createGroup, createAd, createKeywords } from '../creator.js';
import { purchaseGoal } from '../launchcalc.js';
import { exactTag, bookMatches, readyForCampaign } from '../litnetcalc.js';

const app = () => window.__app;
let busy = false;
const current = () => {
  const a = app(), s = a.ctx().settings, fl = s.direct?.firstLaunch || {};
  return { a, s, fl, d: creatorOf(fl), m: s.direct?.metrika || null, today: a.ctx().today };
};
const save = async patch => {
  const { a, s, fl, d } = current();
  await a.store.saveSettings({ direct: { ...s.direct, firstLaunch: { ...fl, ...(patch.campaignId ? { campaignId: String(patch.campaignId) } : {}), creator: { ...d, ...patch } } } });
};
const done = (label, id) => `<p class="fl-made">✓ ${esc(label)} №${esc(String(id))}</p>`;
const btn = (action, label, disabled) => `<button class="primary" data-act="${action}"${disabled || busy ? ' disabled' : ''}>${label}</button>`;
export function creatorCard(a, fl, m) {
  const d = creatorOf(fl), id = d.campaignId, group = d.groupId, ad = d.adId;
  const goal = purchaseGoal(m), v = Number(a.ctx().settings.direct?.proxyV) || 0;
  const issues = validateCreator(d, { today: a.ctx().today, bookUrl: fl.bookUrl, goalId: goal?.id });
  const bookTitles = Object.fromEntries((a.ctx().data.w_books || []).map(b => [String(b.id), b.title]));
  const candidates = (a.ctx().data.w_promolinks || []).filter(x => x.status !== 'archived')
    .map(x => ({ ...x, bookTitle: bookTitles[String(x.bookId)] || x.book || '' }))
    .filter(x => bookMatches(x.bookTitle, fl.book));
  const linked = candidates.find(x => String(x.id) === String(d.litnetLinkId));
  const staleTag = !!d.litnetLinkId && !readyForCampaign(linked, d.start, fl.book);
  const blocked = !a.ctx().settings.directToken || a.ctx().settings.direct?.sandbox || v < 4;
  return `
  <div class="fl-builder">
    <h3>Создать кампанию прямо здесь</h3>
    <p class="small muted">Ты управляешь процессом по шагам: настройки → кампания → группа → объявление → фразы. Каждый шаг подтверждается отдельно. Показы и модерацию не запускаем.</p>
    ${v < 4 ? `<div class="fl-builder-alert">
      <b>Сначала обнови Cloudflare</b>
      <p class="small">Новым кампаниям нужен переходник версии 4. Скопируй код, вставь в Cloudflare → direct → Edit code → Deploy.</p>
      <div class="row"><button data-act="st.worker">Скопировать код</button><button data-act="fl.checkWorker">Проверить переходник</button></div>
    </div>` : ''}
    ${a.ctx().settings.direct?.sandbox ? '<p class="small warnc">Отключи песочницу в Настройках: Яндекс закрыл ее в июле 2026 года.</p>' : ''}
    ${!id ? `
      <form class="settings-form fl-form" data-form="fl.creatorSave">
        <label>Название кампании</label><input name="name" value="${esc(d.name)}" maxlength="255" required>
        <div class="f2">
          <div><label>Место показа</label><select name="placement">
            ${opt('search','Поиск Яндекса',d.placement)}${opt('network','Рекламная сеть',d.placement)}
          </select></div>
          <div><label>Стратегия</label><select name="strategy">
            ${opt('clicks','Максимум кликов',d.strategy)}
            ${goal ? opt('conversions','Максимум конверсий (покупка)',d.strategy) : ''}
          </select></div>
        </div>
        <div class="f2">
          <div><label>Начало показов (не раньше открытия подписки)</label><input name="start" type="date" min="${a.ctx().today}" value="${esc(d.start)}" required></div>
          <div><label>Конец рекламного теста</label><input name="end" type="date" min="${a.ctx().today}" value="${esc(d.end)}" required></div>
        </div>
        <div class="f2">
          <div><label>Лимит расходов за этот период, ₽</label><input name="budget" inputmode="decimal" value="${esc(d.budget)}" required></div>
          <div><label>География</label><select name="region">${opt('225','Россия',d.region)}${opt('0','Все регионы',d.region)}</select></div>
        </div>
        <p class="small muted">Бюджет за весь период, без автоматического продления. Стратегия на конверсии не означает, что покупки появятся сразу. Одна кампания — одна площадка показа.</p>
        <label>Персональная ссылка «Мой Литнет» (необязательно)</label>
        <select name="litnetLinkId"><option value="">Пока нет — добавлю перед запуском</option>
          ${candidates.map(x => opt(x.id, `${x.campaign || 'Реклама'} · до ${x.expires}`, d.litnetLinkId)).join('')}
        </select>
        ${linked ? `<p class="small muted">Параметры URL для кампании: <code>${esc(exactTag(linked.url))}</code></p>` : '<p class="small muted"><button type="button" class="link" data-act="go" data-to="/litnet">Добавить ссылку в «Мой Литнет» →</button></p>'}
        ${staleTag ? '<p class="small warnc">Ссылка истечет до старта рекламы. Выбери новую ссылку из Литнета.</p>' : ''}
        <div class="row d-save"><button class="primary" type="submit">Сохранить настройки</button></div>
      </form>
      ${issues.length ? `<div class="fl-builder-alert"><b>Для создания не хватает:</b><p class="small">${issues.map(esc).join(' • ')}</p></div>` : ''}
      ${btn('fl.createCampaign','Создать черновик кампании',blocked || issues.length > 0 || staleTag)}
    ` : `
      ${done('Кампания',id)}
      <p class="small muted">Создана как ЕПК. ${d.suspended ? 'Остановлена, показы выключены.' : 'Остановка пока не подтверждена, дальше идти нельзя.'}</p>
      ${!d.suspended ? btn('fl.stopCampaign','Проверить остановку',blocked) : ''}
      ${d.suspended && !group ? `
        <form class="settings-form fl-form" data-form="fl.creatorGroup">
          <label>Название группы</label><input name="groupName" value="${esc(d.groupName)}" maxlength="255" required>
          <div class="row d-save"><button type="submit">Сохранить</button></div>
        </form>
        ${btn('fl.createGroup','Создать группу объявлений',blocked)}
      ` : ''}
    `}
    ${group ? `
      ${done('Группа',group)}
      ${!ad ? `
        <form class="settings-form fl-form" data-form="fl.creatorAd">
          <label>Заголовки (с новой строки, до 56 знаков каждый)</label>
          <textarea name="titles" rows="3" required>${esc(d.titles)}</textarea>
          <label>Тексты (с новой строки, до 81 знака каждый)</label>
          <textarea name="texts" rows="3" required>${esc(d.texts)}</textarea>
          <p class="small muted">Будет создано комбинаторное объявление со ссылкой из раздела «Книга и экономика». Обложку добавим позже.</p>
          <div class="row d-save"><button type="submit">Сохранить объявление</button></div>
        </form>
        ${btn('fl.createAd','Создать объявление без модерации',blocked || !fl.bookUrl)}
      ` : ''}
    ` : ''}
    ${ad ? `
      ${done('Объявление',ad)}
      ${!d.keywordDone ? `
        <form class="settings-form fl-form" data-form="fl.creatorKeywords">
          <label>Ключевые фразы, каждая с новой строки</label>
          <textarea name="keywords" rows="4" required>${esc(d.keywords)}</textarea>
          <div class="row d-save"><button type="submit">Сохранить фразы</button></div>
        </form>
        ${btn('fl.createKeywords','Добавить ключевые фразы',blocked)}
      ` : '<p class="small up">✓ Фразы добавлены.</p>'}
      <p class="small">Теперь проверь кампанию в <a href="https://direct.yandex.ru/" target="_blank" rel="noopener">Директе ↗</a>. На модерацию и в показы приложение ее не отправляло.</p>
    ` : ''}
  </div>
  `;
}
acts['fl.checkWorker'] = async () => {
  const { s } = current(), v = await proxyVersion(s);
  await app().store.saveSettings({ direct: { ...s.direct, proxyV: v } });
  toast(v >= 4 ? 'Переходник обновлен' : 'Нужен переходник версии 4');
};
forms['fl.creatorSave'] = async fd => {
  const x = { name: fd.get('name').trim(), placement: fd.get('placement'), strategy: fd.get('strategy'),
    start: fd.get('start'), end: fd.get('end'), budget: N(fd.get('budget')), region: Number(fd.get('region')),
    litnetLinkId: String(fd.get('litnetLinkId') || '') };
  await save(x); toast('Настройки сохранены');
};
forms['fl.creatorGroup'] = async fd => { await save({ groupName: fd.get('groupName').trim() }); toast('Группа сохранена'); };
forms['fl.creatorAd'] = async fd => { await save({ titles: fd.get('titles'), texts: fd.get('texts') }); toast('Тексты сохранены'); };
forms['fl.creatorKeywords'] = async fd => { await save({ keywords: fd.get('keywords') }); toast('Фразы сохранены'); };
const confirmWrite = (message, label) => ask(message, label);
acts['fl.createCampaign'] = async () => {
  if (busy) return false;
  const { a, s, fl, d, m, today } = current();
  if (d.campaignId) { toast('Эта кампания уже создана'); return false; }
  if (s.direct?.sandbox) { toast('Выключи песочницу в Настройках'); return false; }
  if ((await proxyVersion(s)) < 4) { toast('Сначала обнови Cloudflare'); return false; }
  const goal = purchaseGoal(m), err = validateCreator(d, { today, bookUrl: fl.bookUrl, goalId: goal?.id });
  const titles = Object.fromEntries((a.ctx().data.w_books || []).map(b => [String(b.id), b.title]));
  const link = (a.ctx().data.w_promolinks || []).find(x => String(x.id) === String(d.litnetLinkId));
  const linkBook = link && (titles[String(link.bookId)] || link.book || '');
  const withBook = link && { ...link, bookTitle: linkBook };
  if (d.litnetLinkId && (!readyForCampaign(withBook, d.start, fl.book) || !bookMatches(linkBook, fl.book))) {
    toast('Выбранная ссылка «Мой Литнет» не подходит этой книге или уже истекает. Выбери другую.');return false;
  }
  const trackingParams = link ? exactTag(link.url) : '';
  if (err.length) { toast(err[0]); return false; }
  if (!(await confirmWrite('Создать кампанию «'+d.name+'» в реальном Директе? Лимит '+rub(d.budget,0)+' на период, без автопродления. Без запуска показов.', 'Создать черновик'))) return false;
  busy = true;
  try {
    const response = await createCampaign(s,campaignPayload(d,{counterId:m?.counterId,goalId:goal?.id,trackingParams}));
    const id = addedId(response,'Кампания');
    await save({campaignId:String(id),suspended:false});
    if (link && trackingParams) {
      await a.store.put('w_promolinks',{...link,directCampaignId:String(id),appliedTag:trackingParams,appliedAt:new Date().toISOString()});
    }
    try { await pauseCampaign(s,id); await save({suspended:true}); toast('Кампания создана и остановлена'); }
    catch(e) { toast('Кампания создана, но Яндекс не подтвердил остановку. Не добавляй объявления, пока не остановим ее. '+(e.message||e)); }
    // Не загружаем все отчеты автоматически: лишние вызовы вызывают ограничение 56.
  } catch(e) { toast('Ошибка создания: '+(e.message||e)); }
  finally { busy = false; a.rerender(); }
  return false;
};
acts['fl.stopCampaign'] = async () => {
  if (busy) return false;
  const { a, s, d } = current();
  if (!d.campaignId) return false;
  if (!(await confirmWrite('Остановить кампанию №'+d.campaignId+'?', 'Остановить'))) return false;
  busy = true;
  try { await pauseCampaign(s,d.campaignId); await save({suspended:true}); toast('Кампания остановлена'); }
  catch(e) { toast('Не удалось остановить: '+(e.message||e)); }
  finally { busy=false; a.rerender(); }
};
acts['fl.createGroup'] = async () => {
  if (busy) return false;
  const { a, s, d } = current();
  if (!d.suspended || !d.campaignId || d.groupId || !d.groupName.trim()) return false;
  if (!(await confirmWrite('Создать группу «'+d.groupName+'» в остановленной кампании?', 'Создать группу'))) return false;
  busy=true;
  try { const id=addedId(await createGroup(s,groupPayload(d,d.campaignId)),'Группа');
    await save({groupId:String(id)}); toast('Группа создана'); }
  catch(e) { toast('Ошибка группы: '+(e.message||e)); }
  finally { busy=false; a.rerender(); }
};
acts['fl.createAd'] = async () => {
  if (busy) return false;
  const { a,s,fl,d }=current();
  if (!d.suspended || !d.groupId || d.adId) return false;
  let payload;
  try { payload=adPayload(d,d.groupId,fl.bookUrl); }catch(e){toast(e.message);return false;}
  if (!(await confirmWrite('Создать комбинаторное объявление-черновик? Модерация не запускается.', 'Создать объявление')))return false;
  busy=true;
  try {const id=addedId(await createAd(s,payload),'Объявление');await save({adId:String(id)});toast('Объявление создано');}
  catch(e){toast('Ошибка объявления: '+(e.message||e));}
  finally{busy=false;a.rerender();}
};
acts['fl.createKeywords'] = async () => {
  if(busy)return false;
  const {a,s,d}=current();
  if(!d.suspended||!d.adId||d.keywordDone)return false;
  let payload;try{payload=keywordsPayload(d,d.groupId);}catch(e){toast(e.message);return false;}
  if(!(await confirmWrite('Добавить '+payload.Keywords.length+' фраз в созданную группу?', 'Добавить фразы')))return false;
  busy=true;
  try{const res=await createKeywords(s,payload);const fail=(res.AddResults||[]).flatMap(x=>x.Errors||[]);
    if(fail.length)throw new Error(fail.map(x=>x.Message).join('; '));
    if((res.AddResults || []).length !== payload.Keywords.length)throw new Error('Не все фразы подтверждены Яндексом. Проверь их в кабинете перед повтором.');
    await save({keywordDone:true});toast('Фразы добавлены');}
  catch(e){toast('Ошибка фраз: '+(e.message||e));}
  finally{busy=false;a.rerender();}
};
