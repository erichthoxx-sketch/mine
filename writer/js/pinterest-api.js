// Заполняется только после развертывания собственного Pinterest Worker.
// Не разрешать ввод произвольного сервера через интерфейс: туда отправляется Firebase ID token.
export const PINTEREST_WORKER_ORIGIN = '';
export async function pinterestCall(a,path,body,signal){
  if(!PINTEREST_WORKER_ORIGIN)throw Error('Отдельный Pinterest Worker еще не развернут');
  const origin=new URL(PINTEREST_WORKER_ORIGIN);
  if(origin.protocol!=='https:'||origin.pathname!=='/'||origin.search||origin.hash||origin.username||origin.password)throw Error('Некорректная конфигурация Worker');
  const url=new URL(path,origin);
  if(url.origin!==origin.origin||!['/connect','/disconnect','/status','/profile','/boards','/analytics','/publish'].includes(url.pathname))throw Error('Запрещенный маршрут');
  const user=a.store.auth?.currentUser;
  if(!user||user.uid!==a.store.user?.uid)throw Error('Войдите в Мастерскую');
  const r=await fetch(url,{method:body===undefined?'GET':'POST',redirect:'error',credentials:'omit',headers:{Authorization:'Bearer '+await user.getIdToken(),...(body!==undefined?{'Content-Type':'application/json'}:{})},...(body!==undefined?{body:JSON.stringify(body)}:{}),signal:signal||AbortSignal.timeout(40000)});
  const data=await r.json();
  if(!r.ok)throw Error(data.error||'Pinterest: '+r.status);
  return data;
}
export async function publishImage(file){
  if(!file||!['image/jpeg','image/png'].includes(file.type)||file.size>10*1024*1024)throw Error('Для API требуется JPG или PNG до 10 МБ');
  return new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(String(r.result).split(',')[1]);r.onerror=()=>reject(Error('Не удалось прочитать изображение'));r.readAsDataURL(file);});
}
