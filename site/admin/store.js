// Хранилище админки: Firebase (вход той же почтой, что в «Доходах» и «Мастерской») или пробный режим на localhost.
import { firebaseConfig } from '../../js/firebase-config.js';
import { LOCAL, LS, loadLocal } from '../data.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

// ---------- пробный режим: всё в этом браузере ----------
const local = {
  local: true,
  onUser(cb) { cb({ email: 'пробный режим' }); },
  async load() { const d = loadLocal(); return { content: d.content, imgs: d.imgs || {}, owner: 'me' }; },
  _put(fn) { const d = loadLocal(); fn(d); d.imgs ||= {}; localStorage.setItem(LS, JSON.stringify(d)); },
  async saveContent(c) { this._put((d) => { d.content = c; }); },
  async putImg(id, data) { this._put((d) => { d.imgs = { ...d.imgs, [id]: data }; }); },
  async delImg(id) { this._put((d) => { delete d.imgs?.[id]; }); },
  async signOut() {},
};

// ---------- Firebase ----------
async function firebase() {
  const [{ initializeApp }, A, F] = await Promise.all([
    import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
  ]);
  const app = initializeApp(firebaseConfig);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const ref = (c, id) => F.doc(db, c, id);
  return {
    local: false,
    onUser(cb) { A.onAuthStateChanged(auth, cb); },
    signIn: (email, pw) => A.signInWithEmailAndPassword(auth, email, pw),
    reset: (email) => A.sendPasswordResetEmail(auth, email),
    signOut: () => A.signOut(auth),
    // owner: 'me' — это она; 'other' — сайт закреплён за другим входом; при запрете правил — ошибка permission-denied
    async load() {
      const uid = auth.currentUser.uid;
      const own = await F.getDoc(ref('site', 'owner'));
      if (!own.exists()) await F.setDoc(ref('site', 'owner'), { uid, at: new Date().toISOString() });
      else if (own.data().uid !== uid) return { owner: 'other' };
      const main = await F.getDoc(ref('site', 'main'));
      const content = main.exists() ? JSON.parse(main.data().json || 'null') : null;
      const imgs = {};
      (await F.getDocs(F.collection(db, 'site_img'))).forEach((d) => { imgs[d.id] = d.data().data || ''; });
      return { content, imgs, owner: 'me' };
    },
    saveContent: (c) => F.setDoc(ref('site', 'main'), { json: JSON.stringify(c), at: new Date().toISOString() }),
    putImg: (id, data) => F.setDoc(ref('site_img', id), { data }),
    delImg: (id) => F.deleteDoc(ref('site_img', id)),
  };
}

export const openStore = () => (LOCAL ? Promise.resolve(local) : firebase());

export function authError(e) {
  const c = e?.code || '';
  if (/invalid-credential|wrong-password|user-not-found|invalid-email/.test(c)) return 'Почта или пароль не подходят. Это та же почта, что в «Доходах».';
  if (/too-many-requests/.test(c)) return 'Слишком много попыток. Подождите пару минут.';
  if (/network/.test(c)) return 'Нет интернета — попробуйте ещё раз.';
  return 'Не получилось войти. Попробуйте ещё раз.';
}
