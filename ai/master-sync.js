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
  canonicalText(book){
    const L=book?.legend||{};
    const synopsis=typeof book?.synopsis==="string"?book.synopsis:typeof book?.svc?.synopsis==="string"?book.svc.synopsis:"";
    return legendContext(L,{title:book.title||"",mode:"work",sections:["idea","plan","chars","syn"],synopsis}).slice(0,120000);
  }
};
