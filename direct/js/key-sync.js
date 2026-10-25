// Автоматическая загрузка фраз из СВОИХ кампаний, только для исследования.
// Никаких вызовов Keywords.add/update/delete: на сервер Директа ничего не отправляется.
// Чужие кабинеты (таргетологов) недоступны и не могут быть импортированы.
import {keywordId, normKey} from './keywordcalc.js';

export function newObservedKeywords(bindings=[],main={},stats={},existing=[]){
  const has=new Set(existing.map(x=>x.id));
  const out=[];
  const used=new Set();
  for(const b of bindings){
    if(!b?.bookId||!b?.campaignId||b.autoImport===false)continue;
    const cid=Number(b.campaignId);
    const all=[
      ...(main?.keywords||[]).filter(x=>Number(x.cid)===cid&&x.phrase).map(x=>({phrase:x.phrase,source:'direct-keyword'})),
      ...(stats?.queries||[]).filter(x=>Number(x.cid)===cid&&x.query&&Number(x.clicks)>0).map(x=>({phrase:x.query,source:'direct-query'})),
    ];
    for(const row of all.slice(0,600)){
      const phrase=String(row.phrase).trim();
      const id=keywordId(b.bookId,phrase);
      if(!phrase||phrase.length>250||!normKey(phrase)||has.has(id)||used.has(id))continue;
      used.add(id);
      out.push({id,bookId:String(b.bookId),phrase,source:row.source,status:'review',
        count:null,measuredAt:'',updatedAt:new Date().toISOString()});
    }
  }
  return out;
}
export async function autoSyncKeywordLibrary(app){
  if(!app?.ctx||!app?.snap||!app?.store)return 0;
  const ctx=app.ctx(),bindings=ctx.data.d_kw_bindings||[];
  if(!bindings.some(x=>x.campaignId&&x.autoImport!==false))return 0;
  const main=app.snap('main'),stats=app.snap('stats');
  if(!main?.campaigns)return 0; // нет актуального снимка
  const valid=new Set(main.campaigns.map(x=>Number(x.id)));
  const active=bindings.filter(x=>valid.has(Number(x.campaignId)));
  const rows=newObservedKeywords(active,main,stats,ctx.data.d_keywords||[]);
  if(rows.length)await app.store.putMany('d_keywords',rows);
  return rows.length;
}
