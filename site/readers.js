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
};

const remote = {
  async onUser(cb) { const f = await boot(); f.A.onAuthStateChanged(f.auth, (u) => cb(u ? { uid: u.uid, email: u.email } : null)); },
  async signUp(email, pw) { const f = await boot(); const r = await f.A.createUserWithEmailAndPassword(f.auth, email, pw); return { uid: r.user.uid, email: r.user.email }; },
  async signIn(email, pw) { const f = await boot(); const r = await f.A.signInWithEmailAndPassword(f.auth, email, pw); return { uid: r.user.uid, email: r.user.email }; },
  async reset(email) { const f = await boot(); await f.A.sendPasswordResetEmail(f.auth, email); },
  async signOut() { const f = await boot(); await f.A.signOut(f.auth); },
  async load(uid) { const f = await boot(); const d = await f.F.getDoc(docOf(f, uid)); return d.exists() ? d.data() : null; },
  async save(uid, data) { const f = await boot(); await f.F.setDoc(docOf(f, uid), { ...data, at: new Date().toISOString() }, { merge: true }); },
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
