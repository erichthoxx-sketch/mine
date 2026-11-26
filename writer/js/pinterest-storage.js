// Отдельная коллекция, без подписки в основном store и без изменения Firestore rules.
const cloudRef = a => {
  const uid=a.store.user?.uid;
  if(a.store.mode!=='firebase'||!uid||!a.store.F||!a.store.db)throw Error('Облако доступно после входа в Firebase');
  return a.store.F.doc(a.store.db,'users',uid,'pinterest_private','workspace');
};
export async function readCloud(a) {
  const ref=cloudRef(a),snap=await a.store.F.getDocFromServer(ref);
  return snap.exists()?snap.data():{revision:0,pins:[],done:[],ideas:[]};
}
export async function writeCloud(a,expected,data) {
  const ref=cloudRef(a),F=a.store.F;
  return F.runTransaction(a.store.db,async tx=>{
    const snap=await tx.get(ref),revision=snap.exists()?Number(snap.data().revision||0):0;
    if(revision!==expected)throw Error('В облаке другая версия. Сначала экспортируйте локальные данные и загрузите облачную версию.');
    tx.set(ref,{...data,revision:revision+1,updatedAt:F.serverTimestamp()});
    return revision+1;
  });
}
const dbOpen=()=>new Promise((resolve,reject)=>{
  const req=indexedDB.open('freitag-pinterest-assets-v1',1);
  req.onupgradeneeded=()=>req.result.createObjectStore('images');
  req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);
});
async function imageOp(uid,id,mode,blob) {
  if(!uid||!id)throw Error('Нет идентификатора пина');
  const db=await dbOpen();
  try{return await new Promise((resolve,reject)=>{
    const tx=db.transaction('images',mode==='get'?'readonly':'readwrite'),store=tx.objectStore('images');
    const key=uid+'/'+id,req=mode==='get'?store.get(key):mode==='delete'?store.delete(key):store.put(blob,key);
    tx.oncomplete=()=>resolve(req.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||Error('Операция отменена'));
  });}finally{db.close();}
}
export const getImage=(uid,id)=>imageOp(uid,id,'get');
export const putImage=(uid,id,file)=>imageOp(uid,id,'put',file);
export const deleteImage=(uid,id)=>imageOp(uid,id,'delete');
export async function inspectImage(file) {
  if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type)||file.size>20*1024*1024)throw Error('Выберите JPG, PNG или WebP до 20 МБ');
  const bitmap=await createImageBitmap(file);
  try{if(bitmap.width<1||bitmap.height<1||bitmap.width*bitmap.height>40000000)throw Error('Слишком большое изображение');
    return {imageWidth:bitmap.width,imageHeight:bitmap.height,imageNote:file.name||'pin.jpg'};
  }finally{bitmap.close();}
}
