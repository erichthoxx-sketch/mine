// Журнал гипотез: никаких действий с рекламой, только записи и наблюдения.
import { esc, acts, forms, openSheet, toast, ask, uid, opt } from '../../../js/ui.js';
import { rub, num } from '../../../js/format.js';
import { EXPERIMENT_TYPES, compareExperiment } from '../experimentcalc.js';
import { purchaseGoal } from '../launchcalc.js';
import { resolvedLaunch } from './launchctx.js';
import { metrikaOf } from './metrika.js';
const app=()=>window.__app;
const money=x=>rub(x,0);
const camps=a=>(a.snap('main')?.campaigns||[]).filter(x=>x.state!=='ARCHIVED');
const label=k=>EXPERIMENT_TYPES.find(x=>x[0]===k)?.[1]||'Другое';
const date=x=>x?x.split('-').reverse().join('.'):'не указана';
const renderResults=(x,a)=>{
  if(!x.appliedAt)return '<p class="small muted">План, не выполнено. После изменения укажи дату.</p>';
  const c=a.ctx(),s=a.snap('stats')||{},goal=purchaseGoal(metrikaOf(c));
  const r=compareExperiment(x,{today:c.today,campaigns:camps(a),daily:s.daily||[],conversions:s.conv||[],
    goalId:s.mErr?null:goal?.id,sales:c.data.sales||[],directUpdatedAt:s.at,goalsUpdatedAt:s.mAt});
  if(r.state==='no-campaign')return '<p class="small muted">Нет статистики привязанной кампании — обнови Директ.</p>';
  if(r.state==='early')return `<p class="small muted">Еще ${r.daysLeft} дней до итогов первой полной недели. Пока не делаем выводов.</p>`;
  if(r.state!=='comparison')return '<p class="small muted">Статистики пока нет.</p>';
  const goalReady=!!goal&&r.goalFresh&&!s.mErr;
  return `<div class="ex-results">
    <p class="small muted">Две полные недели без дня изменения: ${date(r.periods.beforeFrom)}–${date(r.periods.beforeTo)} и ${date(r.periods.afterFrom)}–${date(r.periods.afterTo)}.</p>
    <div class="scroll"><table><thead><tr><th>Показатель</th><th>До</th><th>После</th></tr></thead><tbody>
      <tr><td>Расход</td><td>${money(r.before.cost)}</td><td>${money(r.after.cost)}</td></tr>
      <tr><td>Клики</td><td>${num(r.before.clicks)}</td><td>${num(r.after.clicks)}</td></tr>
      <tr><td>Цена клика</td><td>${!r.before.clicks?'—':rub(r.before.cost/r.before.clicks,1)}</td><td>${!r.after.clicks?'—':rub(r.after.cost/r.after.clicks,1)}</td></tr>
      <tr><td>Покупки по цели</td><td>${goalReady?num(r.before.conv):'—'}</td><td>${goalReady?num(r.after.conv):'—'}</td></tr>
      <tr><td>Цена покупки</td><td>${goalReady&&r.before.conv>=3?money(r.before.cpa):'—'}</td><td>${goalReady&&r.after.conv>=3?money(r.after.cpa):'—'}</td></tr>
      <tr><td>Роялти книги, все источники</td><td>${r.salesComplete&&r.firstImportedSale&&r.firstImportedSale<=r.periods.beforeFrom?money(r.salesBefore.royalty):'—'}</td><td>${r.salesComplete?money(r.salesAfter.royalty):'—'}</td></tr>
      <tr><td>Продажи книги, все источники</td><td>${r.salesComplete&&r.firstImportedSale&&r.firstImportedSale<=r.periods.beforeFrom?num(r.salesBefore.qty):'—'}</td><td>${r.salesComplete?num(r.salesAfter.qty):'—'}</td></tr>
    </tbody></table></div>
    ${!r.directFresh?'<p class="small warnc">Директ не обновлен после этой недели.</p>':''}
    ${!r.hasBaseline?'<p class="small warnc">Меньше 20 кликов в одном из периодов. Выводы ненадежны.</p>':''}
    ${!goalReady?'<p class="small muted">Нужен свежий отчет конверсий Директа.</p>':''}
    ${!r.salesComplete?`<p class="small muted">Продажи Литнета загружены только до ${esc(r.lastImportedSale||'неизвестной даты')}.</p>`:''}
    <p class="small muted">Сопоставление не доказывает эффект: влияют новые главы, органика и таргетологи Литнета.</p>
  </div>`;
};
export function experimentsView(a){
  const ctx=a.ctx(),fl=resolvedLaunch(a)?.fl||{},list=(ctx.data.d_tests||[]).slice().sort((x,y)=>(y.appliedAt||y.createdAt).localeCompare(x.appliedAt||x.createdAt));
  return {html:`
    <div class="card ex-panel"><div class="row between"><h2 style="margin:0">Журнал рекламных решений</h2><button data-act="go" data-to="/quality">Контроль трафика</button></div>
      <p>Записывай, что хочешь изменить и почему. После фактического изменения сравним две недели по расходам, покупкам и доходу книги.</p>
      <p class="small muted">Журнал не меняет рекламу. Рост продаж после изменения не означает, что его вызвала именно реклама.</p></div>
    <div class="card ex-panel"><h2>Новая гипотеза</h2><form class="settings-form ex-form" data-form="ex.add">
      <label>Книга</label><input name="book" value="${esc(fl.book||'Развод для черной вдовы')}" maxlength="180" required>
      <label>Кампания</label><select name="cid"><option value="">Пока нет — выберу при выполнении</option>
        ${camps(a).map(x=>opt(String(x.id),x.name,fl.campaignId||'')).join('')}</select>
      <label>Что изменяем?</label><select name="kind">${EXPERIMENT_TYPES.map(x=>opt(x[0],x[1],'creative')).join('')}</select>
      <label>Какое конкретное действие?</label><textarea name="change" rows="2" maxlength="1000" placeholder="Новый заголовок, настройка аудитории или фраз" required></textarea>
      <label>Почему это должно помочь?</label><textarea name="hypothesis" rows="2" maxlength="1000" placeholder="Моя проверяемая гипотеза" required></textarea>
      <div class="row d-save"><button class="primary" type="submit">Сохранить гипотезу</button></div>
    </form></div>
    <div class="card ex-panel"><h2>Мои эксперименты</h2>
      ${list.length?`<div class="ex-list">${list.map(x=>`<section class="ex-item">
        <div class="row between"><b>${esc(label(x.kind))}</b><span class="small muted">${x.appliedAt?'Сделано '+date(x.appliedAt):'План'}</span></div>
        <p>${esc(x.change)}</p><p class="small muted">Гипотеза: ${esc(x.hypothesis)}</p>
        <p class="small muted">Книга: ${esc(x.book)}${x.campaignName?' · Кампания: '+esc(x.campaignName):''}</p>
        ${renderResults(x,a)}
        ${!x.appliedAt?`<div class="row"><button data-act="ex.apply" data-id="${esc(x.id)}">Отметить выполнение</button>
          <button class="link danger" data-act="ex.remove" data-id="${esc(x.id)}">Удалить</button></div>`:
          `<form class="settings-form ex-form" data-form="ex.notes" data-id="${esc(x.id)}">
            <label>Мой вывод</label><textarea name="notes" rows="2" maxlength="2000">${esc(x.notes||'')}</textarea>
            <div class="row d-save"><button type="submit">Сохранить вывод</button></div>
          </form><button class="link danger" data-act="ex.remove" data-id="${esc(x.id)}">Удалить запись</button>`}
      </section>`).join('')}</div>`:'<p class="small muted">Еще нет гипотез. План можно записать до запуска рекламы.</p>'}
    </div>`};
}
forms['ex.add']=async fd=>{
  const a=app(),book=String(fd.get('book')||'').trim(),change=String(fd.get('change')||'').trim(),hypothesis=String(fd.get('hypothesis')||'').trim();
  if(!book||!change||!hypothesis){toast('Заполни книгу и оба описания');return false;}
  const camp=camps(a).find(x=>String(x.id)===String(fd.get('cid')));
  await a.store.put('d_tests',{id:'exp_'+uid(),book,change,hypothesis,kind:fd.get('kind')||'other',
    createdAt:new Date().toISOString(),campaignId:camp?String(camp.id):'',campaignName:camp?.name||'',appliedAt:'',notes:''});
  toast('Гипотеза записана. Реклама не менялась.');
};
acts['ex.apply']=d=>{
  const a=app(),x=(a.ctx().data.d_tests||[]).find(x=>x.id===d.id);
  if(!x||x.appliedAt)return false;
  const today=a.ctx().today,cc=camps(a);
  openSheet('Когда реально изменила рекламу?',`
    <p class="small">Записываем выполненное действие, не запускаем рекламу.</p>
    <label>Фактическая дата</label><input name="date" type="date" value="${today}" max="${today}" required>
    <label>Кампания</label><select name="cid" required><option value="">Выбери</option>
    ${cc.map(z=>opt(String(z.id),z.name,x.campaignId)).join('')}</select>`,async fd=>{
      const dt=String(fd.get('date')||''),camp=cc.find(z=>String(z.id)===String(fd.get('cid')));
      if(!dt||dt>today||!camp){toast('Укажи дату и кампанию');return false;}
      await a.store.put('d_tests',{...x,appliedAt:dt,campaignId:String(camp.id),campaignName:camp.name});
      toast('Выполнение записано');
    },{submitText:'Сохранить'});
  return false;
};
forms['ex.notes']=async(fd,el)=>{
  const a=app(),x=(a.ctx().data.d_tests||[]).find(x=>x.id===el.dataset.id);
  if(!x)return false;
  await a.store.put('d_tests',{...x,notes:String(fd.get('notes')||'').trim()});
  toast('Вывод сохранен');
};
acts['ex.remove']=async d=>{
  const a=app(),x=(a.ctx().data.d_tests||[]).find(x=>x.id===d.id);
  if(!x||!(await ask('Удалить запись? Реальная реклама не изменится.','Удалить')))return false;
  await a.store.remove('d_tests',d.id);toast('Запись удалена');return false;
};
