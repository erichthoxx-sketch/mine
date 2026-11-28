import test from "node:test";
import assert from "node:assert/strict";
import {randomBytes} from "node:crypto";
import {fullArchiveStore} from "../ai/cloud-archive.js";

const owner="fixture-owner";
const root="users/"+owner+"/freitag_archive/manifest";
const part=(version,index)=>"users/"+owner+"/freitag_archive/"+version.id+"/parts/"+index;
const archive=text=>({app:"FreitagAI",version:1,data:{
  projects:[{id:"book",storyMap:"Состояние романа"}],chats:[{id:"chat",messages:[{role:"assistant",content:text}]}],
  docs:[{id:"note",text:"\nЗаметка автора\n"}],drafts:{"chat:chat":"  продолжить сцену  "},feedback:[{reason:"Голос автора"}]
}});

function fixture(){
  const docs=new Map();
  const state={uid:owner,breakRead:false,changeBeforePublish:null};
  const snapshot=key=>({exists:()=>docs.has(key),data:()=>docs.get(key)});
  const api={
    doc:(_db,...path)=>path.join("/"),
    Bytes:{fromUint8Array:bytes=>({toUint8Array:()=>bytes.slice()})},
    async getDocFromServer(key){
      assert.ok(key.startsWith("users/"+owner+"/"));
      if(state.breakRead&&key.includes("/parts/"))return snapshot("missing");
      return snapshot(key);
    },
    writeBatch(){
      const writes=[];
      return {set:(key,value)=>writes.push(()=>docs.set(key,value)),delete:key=>writes.push(()=>docs.delete(key)),
        commit:async()=>writes.forEach(write=>write())};
    },
    async runTransaction(_db,work){
      state.changeBeforePublish?.();
      const updates=[];
      const result=await work({get:async key=>snapshot(key),set:(key,value)=>updates.push(()=>docs.set(key,value))});
      updates.forEach(update=>update());
      return result;
    }
  };
  const store=fullArchiveStore({db:{},api,uid:owner,currentUid:()=>state.uid});
  return {docs,state,store};
}

test("verified multi-part backups restore all text, draft whitespace and project memory",async()=>{
  const {docs,store}=fixture();
  const first=archive(randomBytes(530000).toString("base64"));
  const saved=await store.save(first,null);
  assert.ok(saved.parts>1);
  assert.equal((await store.save(first,saved.id)).id,saved.id,"unchanged archives do not create another version");
  assert.deepEqual((await store.load()).value,first);
  const second=await store.save(archive("Новая глава."),saved.id);
  assert.equal(docs.get(root).previous.id,saved.id);
  const oldBytes=docs.get(part(second,0)).bytes.toUint8Array();
  oldBytes[0]^=1;
  docs.set(part(second,0),{bytes:{toUint8Array:()=>oldBytes}});
  const fallback=await store.load();
  assert.equal(fallback.usedPrevious,true);
  assert.equal(fallback.currentId,second.id);
  assert.deepEqual(fallback.value,first);
});

test("interrupted verification and stale devices leave the published archive untouched",async()=>{
  const {docs,state,store}=fixture();
  const first=await store.save(archive("Глава один."),null);
  state.breakRead=true;
  await assert.rejects(store.save(archive("Незавершенная запись."),first.id),/копия неполная/);
  assert.equal(docs.get(root).current.id,first.id);
  state.breakRead=false;
  await assert.rejects(store.save(archive("Другой компьютер."),null),{code:"archive-conflict"});
  const oldParts=docs.size;
  state.changeBeforePublish=()=>{docs.set(root,{current:{...first,id:crypto.randomUUID()},previous:first});};
  await assert.rejects(store.save(archive("Гонка двух компьютеров."),first.id),{code:"archive-conflict"});
  assert.equal(docs.size,oldParts,"unpublished parts are removed when the transaction rejects a stale device");
  state.uid="second-owner";
  await assert.rejects(store.load(),/свой аккаунт/);
});

test("rotation retains the current and immediately previous archives",async()=>{
  const {docs,store}=fixture();
  const one=await store.save(archive("Глава один."),null);
  const two=await store.save(archive("Глава два."),one.id);
  const three=await store.save(archive("Глава три."),two.id);
  assert.deepEqual(docs.get(root),{current:three,previous:two});
  assert.equal(docs.has(part(one,0)),false);
  assert.equal(docs.has(part(two,0)),true);
  assert.equal(docs.has(part(three,0)),true);
  assert.equal((await store.load(true)).manifest.id,two.id);
});
