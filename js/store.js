// Хранилище данных. Два режима с одинаковым интерфейсом:
//  • firebase — вход по почте, данные в Firestore, синхронизация между телефоном и компьютером;
//  • local — пробный режим: данные в этом браузере (если Firebase ещё не настроен).
import { COLLECTIONS } from './parse.js';
import { firebaseConfig } from './firebase-config.js';

export const DEFAULT_SETTINGS = {
  pseudonym: 'Лана Фрейтаг',
  taxRate: 4,            // % — самозанятая (НПД): 4 % с доходов от физлиц
  taxBase: 'gross',      // gross — от полной цены книг; royalty — от роялти
  litnetThreshold: 10000,
  litnetPct: 20,
  baseDays: 14,
  rocketCap: 50,
  widgetStep: 20000,     // приоритетные показы в виджетах: за каждые 20 000 ₽ рекламы в месяц…
  widgetPerRub: 2,       // …по 2 показа за каждый рубль — начисляются в следующем месяце
  goalStart: '2026-10',
  goalAmount: 50000,
  goalGrowth: 12,        // % в месяц
  planOverrides: {},
};

const clean = (o) => JSON.parse(JSON.stringify(o));
const emptyData = (colls) => Object.fromEntries([['settings', { ...DEFAULT_SETTINGS }], ...colls.map((c) => [c, []])]);

// На localhost (проверка при разработке) всегда пробный режим
const isLocalDev = typeof location !== 'undefined' && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const firebaseConfigured = !isLocalDev && !Object.values(firebaseConfig).some((v) => String(v).includes('ВСТАВЬТЕ'));

class Base {
  constructor(colls = COLLECTIONS) { this.colls = colls; this.data = emptyData(colls); this.listeners = new Set(); this.user = null; this.mode = 'local'; this.sync = 'ok'; }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  emit() { this.version = (this.version || 0) + 1; this.listeners.forEach((f) => f(this.data)); }
  // куски по 400 (предел одной записи Firestore) уходят одновременно, а не по очереди — большая выгрузка сохраняется быстрее
  async putMany(coll, items) { const parts = []; for (let i = 0; i < items.length; i += 400) parts.push(items.slice(i, i + 400)); await Promise.all(parts.map((p) => this._write(coll, p, []))); }
  async removeMany(coll, ids) { for (let i = 0; i < ids.length; i += 400) await this._write(coll, [], ids.slice(i, i + 400)); }
  put(coll, item) { return this.putMany(coll, [item]); }
  // Обновляет только указанные поля, чтобы фоновая синхронизация
  // не могла стереть изменения другой формы или вкладки.
  async patch(coll, id, fields) {
    const previous = this.data[coll]?.find(item => String(item.id) === String(id));
    if (!previous) throw new Error('Запись не найдена — изменения не сохранены');
    return this.put(coll, { ...previous, ...clean(fields), id: previous.id });
  }
  remove(coll, id) { return this.removeMany(coll, [id]); }
  async replaceAll(backup) {
    await this.saveSettings({ ...(backup.settings || {}) });
    for (const c of this.colls) {
      if (!backup[c]) continue;
      const keep = new Set(backup[c].map((x) => String(x.id)));
      await this.removeMany(c, this.data[c].filter((x) => !keep.has(String(x.id))).map((x) => x.id));
      await this.putMany(c, backup[c]);
    }
  }
}

// ---------- пробный режим ----------
class LocalStore extends Base {
  constructor(colls, key = 'authorTracker.v1') { super(colls); this.mode = 'local'; this.key = key; }
  async init() {
    try {
      const raw = JSON.parse(localStorage.getItem(this.key) || 'null');
      if (raw) this.data = { ...emptyData(this.colls), ...raw, settings: { ...DEFAULT_SETTINGS, ...raw.settings } };
    } catch { /* пустое хранилище */ }
    this.user = { email: 'пробный режим' };
    this.settingsLoaded = true;
    this.loaded = Object.fromEntries(this.colls.map((c) => [c, true]));
    this.emit();
  }
  _save() { try { localStorage.setItem(this.key, JSON.stringify(this.data)); } catch { this.sync = 'error'; } this.emit(); }
  async _write(coll, items, delIds) {
    const arr = this.data[coll];
    const idx = new Map(arr.map((x, i) => [String(x.id), i]));
    for (const it of items) {
      const c = clean(it);
      if (idx.has(String(c.id))) arr[idx.get(String(c.id))] = c; else { idx.set(String(c.id), arr.length); arr.push(c); }
    }
    if (delIds.length) { const d = new Set(delIds.map(String)); this.data[coll] = arr.filter((x) => !d.has(String(x.id))); }
    this._save();
  }
  async saveSettings(s) { this.data.settings = { ...this.data.settings, ...clean(s) }; this._save(); }
  async signOut() { /* в пробном режиме выходить некуда */ }
}

// ---------- Firebase ----------
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';
class FirebaseStore extends Base {
  constructor(colls) { super(colls); this.mode = 'firebase'; this.authReady = false; this.unsubs = []; }
  async init() {
    const [{ initializeApp }, A, F] = await Promise.all([
      import(FB + 'firebase-app.js'), import(FB + 'firebase-auth.js'), import(FB + 'firebase-firestore.js'),
    ]);
    this.A = A; this.F = F;
    const app = initializeApp(firebaseConfig);
    this.auth = A.getAuth(app);
    this.db = F.initializeFirestore(app, { localCache: F.persistentLocalCache({ tabManager: F.persistentMultipleTabManager() }) });
    await new Promise((resolve) => {
      A.onAuthStateChanged(this.auth, (u) => {
        const nextUid = u?.uid || null;
        // Смена аккаунта: не показываем/не используем прошлую кешированную базу.
        if ((this.user?.uid || null) !== nextUid) {
          this.data = emptyData(this.colls);
          this.loaded = {};
          this.pending = {};
          this.settingsLoaded = false;
          this.settingsServerLoaded = false;
          this.sync = 'ok';
          this.error = null;
        }
        this.user = u ? { email: u.email, uid: u.uid } : null;
        this.unsubs.forEach((f) => f()); this.unsubs = [];
        if (u) this._listen(u.uid);
        this.authReady = true; this.emit(); resolve();
      });
    });
  }
  _listen(uid) {
    const { collection, doc, onSnapshot } = this.F;
    for (const c of this.colls) {
      this.unsubs.push(onSnapshot(collection(this.db, 'users', uid, c), { includeMetadataChanges: true }, (snap) => {
        this.data[c] = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
        if (!snap.metadata.fromCache) (this.loaded ||= {})[c] = true; // пришло с сервера — данные полные
        // «сохраняется…», пока хотя бы в одной коллекции есть неподтверждённые записи
        (this.pending ||= {})[c] = snap.metadata.hasPendingWrites;
        if (this.sync !== 'error') this.sync = Object.values(this.pending).some(Boolean) ? 'pending' : 'ok';
        this.emit();
      }, (e) => { this.sync = 'error'; this.error = e; this.emit(); }));
    }
    this.unsubs.push(onSnapshot(doc(this.db, 'users', uid, 'meta', 'settings'), { includeMetadataChanges: true }, (d) => {
      this.data.settings = { ...DEFAULT_SETTINGS, ...(d.exists() ? d.data() : {}) };
      this.settingsLoaded = !d.metadata?.fromCache || d.exists();
      if (!d.metadata?.fromCache) this.settingsServerLoaded = true;
      this.emit();
    }));
  }
  // CSV нельзя сопоставлять с неполным офлайн-кешем.
  // Считываем обе необходимые коллекции непосредственно с Firestore при импорте,
  // не требуя прихода metadata-only onSnapshot-событий от других разделов.
  async prepareSalesImport() {
    if (!this.user) throw new Error('Нужно войти в аккаунт');
    const { collection, getDocsFromServer } = this.F;
    const uid = this.user.uid;
    const names = ['sales', 'books'];
    const request = Promise.all(names.map(name =>
      getDocsFromServer(collection(this.db, 'users', uid, name))
    ));
    let timer;
    const timeout = new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error('Не удалось получить данные с Firebase. Проверь интернет и попробуй снова.')), 15000);
    });
    let snapshots;
    try { snapshots = await Promise.race([request, timeout]); }
    finally { clearTimeout(timer); }
    if (uid !== this.user?.uid) throw new Error('Аккаунт изменился во время загрузки');
    // Не затираем локальные неподтвержденные изменения серверной копией.
    if (this.pending?.sales || this.pending?.books)
      throw new Error('Есть продажи или книги, которые еще сохраняются. Повтори импорт после сохранения.');
    for (let i = 0; i < names.length; i++) {
      this.data[names[i]] = snapshots[i].docs.map(d => ({ ...d.data(), id: d.id }));
      (this.loaded ||= {})[names[i]] = true;
    }
    this.emit();
  }
  async _write(coll, items, delIds) {
    const { writeBatch, doc } = this.F;
    const b = writeBatch(this.db);
    for (const it of items) { const c = clean(it); b.set(doc(this.db, 'users', this.user.uid, coll, String(c.id)), c); }
    for (const id of delIds) b.delete(doc(this.db, 'users', this.user.uid, coll, String(id)));
    // Без сети запись ставится в очередь и уйдёт при появлении связи, поэтому не ждём подтверждения сервера
    const p = b.commit();
    p.catch((e) => { this.sync = 'error'; this.error = e; this.emit(); });
    if (navigator.onLine) await p;
  }
  async patch(coll, id, fields) {
    if (!this.user) throw new Error('Нужно войти в аккаунт');
    const { updateDoc, doc } = this.F;
    // Firestore обновит поля атомарно, без подмены остальных полей документа.
    const update = { ...clean(fields) };
    delete update.id;
    const p = updateDoc(doc(this.db, 'users', this.user.uid, coll, String(id)), update);
    p.catch(e => { this.sync = 'error'; this.error = e; this.emit(); });
    if (navigator.onLine) await p;
  }
  async saveSettings(s) {
    const { setDoc, doc } = this.F;
    const merged = { ...this.data.settings, ...clean(s) };
    await setDoc(doc(this.db, 'users', this.user.uid, 'meta', 'settings'), merged);
  }
  signIn(email, pw) { return this.A.signInWithEmailAndPassword(this.auth, email, pw); }
  signUp(email, pw) { return this.A.createUserWithEmailAndPassword(this.auth, email, pw); }
  reset(email) { return this.A.sendPasswordResetEmail(this.auth, email); }
  signOut() { return this.A.signOut(this.auth); }
}

// colls — какие коллекции нужны приложению; localKey — где хранить пробный режим
export function createStore({ colls = COLLECTIONS, localKey } = {}) { return firebaseConfigured ? new FirebaseStore(colls) : new LocalStore(colls, localKey); }

export function authErrorText(e) {
  const c = e?.code || '';
  if (/invalid-credential|wrong-password|user-not-found/.test(c)) return 'Неверная почта или пароль.';
  if (/email-already-in-use/.test(c)) return 'Этот адрес уже зарегистрирован — нажмите «Войти».';
  if (/weak-password/.test(c)) return 'Пароль слишком простой: нужно минимум 6 символов.';
  if (/invalid-email/.test(c)) return 'Проверьте адрес почты.';
  if (/network/.test(c)) return 'Нет связи с интернетом.';
  if (/too-many/.test(c)) return 'Слишком много попыток. Подождите несколько минут.';
  return 'Не получилось: ' + (e?.message || c);
}
