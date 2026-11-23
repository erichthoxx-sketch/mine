// Stored under the signed-in owner's existing Firestore namespace.
const PART_BYTES=400000;
const MAX_PARTS=200;
const BATCH_PARTS=16;
const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",bytes)),
  n=>n.toString(16).padStart(2,"0")).join("");

function isFreitagArchive(value){
  const data=value?.data;
  return value?.app==="FreitagAI" && value?.version===1 &&
    ["projects","chats","docs"].every(key=>Array.isArray(data?.[key]));
}

async function pack(value){
  const content=new Blob([JSON.stringify(value)]);
  const encoding=typeof CompressionStream==="function"?"gzip":"json";
  const stream=encoding==="gzip"?content.stream().pipeThrough(new CompressionStream("gzip")):content.stream();
  const bytes=new Uint8Array(await new Response(stream).arrayBuffer());
  return {bytes,encoding,sha256:await digest(bytes)};
}

function validVersion(value){
  return typeof value?.id==="string" && /^[a-f0-9-]{36}$/i.test(value.id) &&
    Number.isSafeInteger(value.size) && value.size>0 &&
    Number.isSafeInteger(value.parts) && value.parts<=MAX_PARTS && value.parts===Math.ceil(value.size/PART_BYTES) &&
    typeof value.sha256==="string" && /^[a-f0-9]{64}$/.test(value.sha256) &&
    ["json","gzip"].includes(value.encoding);
}

function conflict(){
  return Object.assign(new Error("В Firebase уже есть более свежая копия. Сначала проверь или восстанови ее."),{code:"archive-conflict"});
}

export function fullArchiveStore({db,api,uid,currentUid}){
  const checkOwner=()=>{
    if(!uid||currentUid()!==uid)throw Error("Войди в свой аккаунт Мастерской.");
  };
  const root=api.doc(db,"users",uid,"freitag_archive","manifest");
  const partRef=(id,index)=>api.doc(db,"users",uid,"freitag_archive",id,"parts",String(index));
  const readMeta=snapshot=>snapshot.exists()?snapshot.data():{current:null,previous:null};

  async function status(){
    checkOwner();
    const meta=readMeta(await api.getDocFromServer(root));
    checkOwner();
    return meta;
  }

  async function readBytes(manifest){
    if(!validVersion(manifest))throw Error("В облачной копии повреждены сведения о версии.");
    const bytes=new Uint8Array(manifest.size);
    for(let start=0;start<manifest.parts;start+=BATCH_PARTS){
      checkOwner();
      const end=Math.min(start+BATCH_PARTS,manifest.parts);
      const snapshots=await Promise.all(Array.from({length:end-start},(_,offset)=>
        api.getDocFromServer(partRef(manifest.id,start+offset))));
      for(const [offset,snapshot] of snapshots.entries()){
        const index=start+offset, position=index*PART_BYTES;
        const part=snapshot.exists()?snapshot.data().bytes?.toUint8Array?.():null;
        if(part?.length!==Math.min(PART_BYTES,manifest.size-position))
          throw Error("Облачная копия неполная.");
        bytes.set(part,position);
      }
    }
    checkOwner();
    if(await digest(bytes)!==manifest.sha256)throw Error("Контрольная сумма облачной копии не совпала.");
    return bytes;
  }

  async function deleteParts(id,count){
    for(let start=0;start<count;start+=BATCH_PARTS){
      checkOwner();
      const batch=api.writeBatch(db);
      for(let index=start;index<Math.min(start+BATCH_PARTS,count);index++)
        batch.delete(partRef(id,index));
      await batch.commit();
    }
  }

  async function save(value,expectedId){
    if(!isFreitagArchive(value))throw Error("Неверный формат архива Freitag AI.");
    const before=await status();
    if((before.current?.id||null)!==expectedId)throw conflict();
    const {bytes,encoding,sha256}=await pack(value);
    checkOwner();
    if(before.current?.sha256===sha256){
      try{await readBytes(before.current);return before.current;}
      catch{checkOwner();}
    }
    const manifest={id:crypto.randomUUID(),savedAt:new Date().toISOString(),
      size:bytes.length,parts:Math.ceil(bytes.length/PART_BYTES),encoding,sha256};
    if(manifest.parts>MAX_PARTS)throw Error("Облачный архив слишком велик. Полный архив можно скачать в JSON.");
    try{
      for(let start=0;start<manifest.parts;start+=BATCH_PARTS){
        checkOwner();
        const batch=api.writeBatch(db);
        const end=Math.min(start+BATCH_PARTS,manifest.parts);
        for(let index=start;index<end;index++){
          const offset=index*PART_BYTES;
          batch.set(partRef(manifest.id,index),{bytes:api.Bytes.fromUint8Array(bytes.subarray(offset,offset+PART_BYTES))});
        }
        await batch.commit();
      }
      await readBytes(manifest);
    }catch(err){
      void deleteParts(manifest.id,manifest.parts).catch(()=>{});
      throw err;
    }
    // A cloud version becomes visible only after all its parts are verified.
    let expired;
    try{
      expired=await api.runTransaction(db,async transaction=>{
        checkOwner();
        const latest=readMeta(await transaction.get(root));
        checkOwner();
        if((latest.current?.id||null)!==expectedId)throw conflict();
        transaction.set(root,{current:manifest,previous:latest.current||null});
        return latest.previous;
      });
    }catch(err){
      // With an uncertain commit outcome, keep the parts for recovery.
      if(err.code==="archive-conflict")void deleteParts(manifest.id,manifest.parts).catch(()=>{});
      throw err;
    }
    if(validVersion(expired))void deleteParts(expired.id,expired.parts).catch(()=>{});
    return manifest;
  }

  async function load(previous=false){
    const meta=await status();
    if(!meta.current)throw Error("Полной облачной копии Freitag AI пока нет.");
    if(previous&&!meta.previous)throw Error("Пока сохранена только одна версия.");
    let firstError;
    for(const manifest of (previous?[meta.previous]:[meta.current,meta.previous].filter(Boolean))){
      try{
        const bytes=await readBytes(manifest);
        const content=new Blob([bytes]);
        const stream=manifest.encoding==="gzip"?content.stream().pipeThrough(new DecompressionStream("gzip")):content.stream();
        const value=await new Response(stream).json();
        checkOwner();
        if(!isFreitagArchive(value))throw Error("Это не архив Freitag AI.");
        return {value,manifest,currentId:meta.current.id,usedPrevious:manifest.id!==meta.current.id};
      }catch(err){firstError??=err;}
    }
    throw firstError;
  }
  return {status,save,load};
}
