// Freitag AI: безопасное чтение канона из той же Firebase, что использует Мастерская.
// Здесь нет прав на запись рукописей, книг или Легенды.
// Firebase client config публичен; доступ контролируется Firestore rules + UID.
import { firebaseConfig } from "../js/firebase-config.js";
import { legendContext } from "../writer/js/legend.js";
const base = "https://www.gstatic.com/firebasejs/10.12.2/";
const state = { ready:false, user:null, books:[], error:"", auth:null, db:null, mods:null };
let loading;
export const master = {
  get ready(){ return state.ready; },
  get user(){ return state.user; },
  get books(){ return state.books; },
  get error(){ return state.error; },
  async init(){
    if(loading)return loading;
    loading=(async()=>{
      try{
        const [A,F,Apps]=await Promise.all([
          import(base+"firebase-auth.js"),
          import(base+"firebase-firestore.js"),
          import(base+"firebase-app.js")
        ]);
        const app=Apps.getApps().length?Apps.getApp():Apps.initializeApp(firebaseConfig);
        state.auth=A.getAuth(app);
        state.db=F.getFirestore(app);
        state.mods={A,F};
        await new Promise((resolve,reject)=>{
          let unsub=()=>{};
          unsub=A.onAuthStateChanged(state.auth,u=>{state.user=u?{uid:u.uid,email:u.email}:null;unsub();resolve();},reject);
        });
        state.ready=true;state.error="";
      }catch(e){state.error=e?.message||String(e);throw e;}
    })();
    return loading;
  },
  async login(email,password){
    await this.init();
    await state.mods.A.signInWithEmailAndPassword(state.auth,email,password);
    state.user=state.auth.currentUser?{uid:state.auth.currentUser.uid,email:state.auth.currentUser.email}:null;
    state.books=[];state.error="";
    return this.refresh();
  },
  async refresh(){
    await this.init();
    const user=state.auth.currentUser;
    if(!user){state.user=null;state.books=[];throw Error("Войди в аккаунт Мастерской");}
    state.user={uid:user.uid,email:user.email};
    try{
      const {collection,getDocsFromServer}=state.mods.F;
      const snap=await getDocsFromServer(collection(state.db,"users",user.uid,"w_books"));
      state.books=snap.docs.map(d=>({...d.data(),id:d.id})).sort((a,b)=>String(a.title||"").localeCompare(String(b.title||""),"ru"));
      state.error="";return state.books;
    }catch(e){state.error=e?.message||String(e);throw e;}
  },
  // Резервная копия только памяти (проекты + авторские примеры).
  // Рукописи в Мастерской не меняем. Чаты остаются в IndexedDB и JSON-экспорте.
  async saveMemory(projects,feedback){
    await this.init();
    const user=state.auth.currentUser;
    if(!user)throw Error("Сначала войди в аккаунт Мастерской через раздел «Проекты».");
    const {doc,writeBatch}=state.mods.F;
    const rows=[
      ...projects.map(p=>({group:"freitag_projects",id:p.id,data:p})),
      ...feedback.map(f=>({group:"freitag_examples",id:f.id,data:f}))
    ];
    for(const row of rows){
      if(!/^[a-zA-Z0-9_-]{1,180}$/.test(row.id))throw Error("Недопустимый идентификатор записи.");
      if(new TextEncoder().encode(JSON.stringify(row.data)).length>700000)
        throw Error("Слишком большой проект для облачной записи. Сначала скачай полный JSON-архив.");
    }
    for(let offset=0;offset<rows.length;offset+=300){
      if(state.auth.currentUser?.uid!==user.uid)throw Error("Аккаунт изменился во время сохранения.");
      const batch=writeBatch(state.db);
      for(const row of rows.slice(offset,offset+300))
        batch.set(doc(state.db,"users",user.uid,row.group,row.id),row.data);
      await batch.commit();
    }
    const meta={version:1,projectIds:projects.map(p=>p.id),feedbackIds:feedback.map(f=>f.id),savedAt:new Date().toISOString()};
    const batch=writeBatch(state.db);
    batch.set(doc(state.db,"users",user.uid,"freitag_meta","snapshot"),meta);
    await batch.commit();
    return meta;
  },
  async loadMemory(){
    await this.init();
    const user=state.auth.currentUser;
    if(!user)throw Error("Сначала войди в аккаунт Мастерской через раздел «Проекты».");
    const {doc,getDocFromServer,collection,getDocsFromServer}=state.mods.F;
    const metaSnap=await getDocFromServer(doc(state.db,"users",user.uid,"freitag_meta","snapshot"));
    if(!metaSnap.exists())throw Error("Резервной копии Freitag AI в Firebase пока нет.");
    const meta=metaSnap.data();
    const [p,f]=await Promise.all([
      getDocsFromServer(collection(state.db,"users",user.uid,"freitag_projects")),
      getDocsFromServer(collection(state.db,"users",user.uid,"freitag_examples"))
    ]);
    if(state.auth.currentUser?.uid!==user.uid)throw Error("Аккаунт изменился во время загрузки.");
    const pids=new Set(meta.projectIds||[]),fids=new Set(meta.feedbackIds||[]);
    return {projects:p.docs.filter(d=>pids.has(d.id)).map(d=>({...d.data(),id:d.id})),
      feedback:f.docs.filter(d=>fids.has(d.id)).map(d=>({...d.data(),id:d.id})),
      savedAt:meta.savedAt};
  },
  canonicalText(book){
    const L=book?.legend||{};
    const synopsis=typeof book?.synopsis==="string"?book.synopsis:typeof book?.svc?.synopsis==="string"?book.svc.synopsis:"";
    return legendContext(L,{title:book.title||"",mode:"work",sections:["idea","plan","chars","syn"],synopsis}).slice(0,120000);
  }
};
