// Кабинеты читателей: вход по почте и паролю (Firebase, тот же проект, что и сайт).
// Данные читателя — users/{uid}/meta/reader: по правилам Firebase каждый видит только свои.
// Библиотеки Firebase грузятся только когда читатель входит (или уже входил на этом устройстве).
import { firebaseConfig } from '../js/firebase-config.js';
import { LOCAL } from './data.js';

const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
let fb = null;
async function boot() {
  if (fb) return fb;
  const [{ initializeApp }, A, F] = await Promise.all([import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js')]);
  const app = initializeApp(firebaseConfig, 'readers');
  const auth = A.getAuth(app);
  auth.languageCode = 'ru'; // письмо «сменить пароль» — по-русски
  fb = { A, F, auth, db: F.getFirestore(app) };
  return fb;
}
const docOf = (f, uid) => f.F.doc(f.db, 'users', uid, 'meta', 'reader');

// На своём компьютере (localhost) — всё в этом браузере, как пробный режим сайта
const LK = 'lanaSite.localReader';
const local = {
  async onUser(cb) { const u = JSON.parse(localStorage.getItem(LK) || 'null'); cb(u); },
  async signUp(email) { const u = { uid: 'local', email }; localStorage.setItem(LK, JSON.stringify(u)); return u; },
  async signIn(email) { return this.signUp(email); },
  async reset() {},
  async signOut() { localStorage.removeItem(LK); },
  async load() { return null; },
  async save() {},
  // розыгрыш на своём компьютере — в этом же браузере (админка в пробном режиме видит те же записи)
  async raffleGet(uid) { return JSON.parse(localStorage.getItem('lanaSite.raffle') || '{}')[uid] || null; },
  async raffleSet(uid, data) { const all = JSON.parse(localStorage.getItem('lanaSite.raffle') || '{}'); all[uid] = data; localStorage.setItem('lanaSite.raffle', JSON.stringify(all)); },
  async wins(uid) { return JSON.parse(localStorage.getItem('lanaSite.wins') || '[]').filter((w) => w.uid === uid); },
};

const remote = {
  async onUser(cb) { const f = await boot(); f.A.onAuthStateChanged(f.auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null)); },
  async signUp(email, pw) { const f = await boot(); const r = await f.A.createUserWithEmailAndPassword(f.auth, email, pw); return { uid: r.user.uid, email: r.user.email }; },
  async signIn(email, pw) { const f = await boot(); const r = await f.A.signInWithEmailAndPassword(f.auth, email, pw); return { uid: r.user.uid, email: r.user.email }; },
  async reset(email) { const f = await boot(); await f.A.sendPasswordResetEmail(f.auth, email); },
  async signOut() { const f = await boot(); await f.A.signOut(f.auth); },
  async load(uid) { const f = await boot(); const d = await f.F.getDoc(docOf(f, uid)); return d.exists() ? d.data() : null; },
  async save(uid, data) { const f = await boot(); await f.F.setDoc(docOf(f, uid), { ...data, at: new Date().toISOString() }, { merge: true }); },
  // розыгрыш: своя запись (какую книгу хочет) и свои победы — по правилам Firebase другим не видны
  async raffleGet(uid) { const f = await boot(); const d = await f.F.getDoc(f.F.doc(f.db, 'site_raffle', uid)); return d.exists() ? d.data() : null; },
  async raffleSet(uid, data) { const f = await boot(); await f.F.setDoc(f.F.doc(f.db, 'site_raffle', uid), data); },
  async wins(uid) {
    const f = await boot(), out = [];
    (await f.F.getDocs(f.F.query(f.F.collection(f.db, 'site_wins'), f.F.where('uid', '==', uid)))).forEach((d) => out.push(d.data()));
    return out;
  },
};
export const readers = LOCAL ? local : remote;

// Понятные слова вместо кодов ошибок Firebase
export function readerError(e) {
  const c = e?.code || '';
  if (/email-already-in-use/.test(c)) return 'Кабинет с этой почтой уже есть — нажмите «Войти».';
  if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'Почта или пароль не подходят. Забыли пароль — нажмите «Забыли пароль?».';
  if (/invalid-email/.test(c)) return 'Проверьте почту — в адресе ошибка.';
  if (/weak-password/.test(c)) return 'Пароль слишком короткий — нужно от 6 знаков.';
  if (/too-many-requests/.test(c)) return 'Слишком много попыток. Подождите пару минут.';
  if (/network/.test(c)) return 'Нет интернета — попробуйте ещё раз.';
  return 'Не получилось. Попробуйте ещё раз.';
}
