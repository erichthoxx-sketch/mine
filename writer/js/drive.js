// Google Диск и Google Документы. Вход Google — отдельно от входа в приложение, токен живёт ~1 час,
// дальше Google просит подтвердить одним нажатием. На localhost — пробный «диск» для проверки интерфейса.
import { googleClientId } from '../../js/firebase-config.js';
import { charsFromDocsJson, charsFromDocxXml } from './wcalc.js';

const SCOPE = 'https://www.googleapis.com/auth/drive';
export const MIME = {
  doc: 'application/vnd.google-apps.document',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  folder: 'application/vnd.google-apps.folder',
};
const isLocalDev = /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
export const driveConfigured = isLocalDev || !String(googleClientId).includes('ВСТАВЬТЕ');
export class NeedAuth extends Error {}

const ls = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* нет доступа к памяти браузера */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* ок */ } },
};

let token = null;
function loadToken() {
  try { const t = JSON.parse(ls.get('gdrive.token') || 'null'); token = t && t.exp > Date.now() ? t : null; } catch { token = null; }
  return token;
}
// «Подключён» — если доступ к Диску уже давали на этом устройстве. Сам ключ Google живёт ~1 час;
// когда он истёк, следующее нажатие любой кнопки Диска тихо берёт новый (без экрана согласия).
export const isConnected = () => (isLocalDev ? !!ls.get('gdrive.mock') : !!loadToken() || !!ls.get('gdrive.consented'));
export const hasFreshToken = () => (isLocalDev ? !!ls.get('gdrive.mock') : !!loadToken());

let gis;
export function preload() {
  if (isLocalDev || !driveConfigured) return Promise.resolve();
  return (gis ||= new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.onload = res; s.onerror = () => { gis = null; rej(new Error('Не загрузился вход Google. Проверьте интернет.')); };
    document.head.appendChild(s);
  }));
}

// Свежий ключ Google: если есть — сразу; если истёк — короткое окно Google без вопросов (уже разрешено).
// Вызывать в начале обработчика нажатия, до других ожиданий, — иначе браузер заблокирует окно.
export async function ensureToken() {
  if (isLocalDev || loadToken()) return;
  await connect();
}

// Вызывать только по нажатию кнопки — иначе браузер заблокирует окно Google
export async function connect() {
  if (isLocalDev) { ls.set('gdrive.mock', '1'); return; }
  if (!window.google?.accounts?.oauth2) await preload();
  await new Promise((res, rej) => {
    const client = window.google.accounts.oauth2.initTokenClient({
      client_id: googleClientId,
      scope: SCOPE,
      callback: (r) => {
        if (r.error) { rej(new Error(r.error_description || r.error)); return; }
        token = { access_token: r.access_token, exp: Date.now() + (Number(r.expires_in) - 60) * 1000 };
        ls.set('gdrive.token', JSON.stringify(token)); ls.set('gdrive.consented', '1');
        // запоминаем почту Google — в следующий раз окно не спрашивает, какой аккаунт
        if (!ls.get('gdrive.email')) fetch('https://www.googleapis.com/drive/v3/about?fields=user(emailAddress)', { headers: { Authorization: 'Bearer ' + r.access_token } }).then((x) => x.json()).then((j) => { if (j?.user?.emailAddress) ls.set('gdrive.email', j.user.emailAddress); }).catch(() => {});
        res();
      },
      error_callback: (e) => rej(new Error(e?.type === 'popup_closed' ? 'Окно Google закрыто — нажмите ещё раз.' : (e?.message || 'Google не дал доступ'))),
    });
    const hint = ls.get('gdrive.email');
    client.requestAccessToken({ prompt: ls.get('gdrive.consented') ? '' : 'consent', ...(hint ? { login_hint: hint, hint } : {}) });
  });
}
export function disconnect() {
  if (isLocalDev) { ls.del('gdrive.mock'); return; }
  if (token && window.google?.accounts?.oauth2) window.google.accounts.oauth2.revoke(token.access_token, () => {});
  token = null; ls.del('gdrive.token'); ls.del('gdrive.consented'); ls.del('gdrive.email');
}

async function gfetch(url, opts = {}) {
  if (!loadToken()) throw new NeedAuth(ls.get('gdrive.consented') ? 'Google просит обновить доступ — нажмите «Обновить с Диска».' : 'Подключите Google Диск (кнопка вверху).');
  const r = await fetch(url, { ...opts, headers: { ...(opts.headers || {}), Authorization: 'Bearer ' + token.access_token } });
  if (r.status === 401) { token = null; ls.del('gdrive.token'); throw new NeedAuth('Google просит обновить доступ — нажмите «Обновить с Диска».'); }
  if (!r.ok) {
    let msg = '';
    try { msg = (await r.json())?.error?.message || ''; } catch { /* ок */ }
    throw new Error(`Google Диск: ${r.status}${msg ? ' — ' + msg : ''}`);
  }
  return r;
}
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const FIELDS = 'id,name,mimeType,modifiedTime,webViewLink,parents,shortcutDetails(targetId,targetMimeType)';
const SHORTCUT = 'application/vnd.google-apps.shortcut';
const isDoc = (m) => m === MIME.doc || m === MIME.docx;
const q = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

async function listQuery(query) {
  if (isLocalDev) return mock.query(query);
  const out = [];
  let page = '';
  do {
    const u = `${DRIVE}?q=${encodeURIComponent(query)}&fields=nextPageToken,files(${FIELDS})&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${page ? '&pageToken=' + page : ''}`;
    const j = await (await gfetch(u)).json();
    out.push(...j.files); page = j.nextPageToken || '';
  } while (page);
  return out;
}

export const findFolders = (name) => listQuery(`mimeType='${MIME.folder}' and name contains '${q(name)}' and trashed=false`);

// Все документы (Google Документы и Word) в папке и её подпапках, с путём
export async function listDocsTree(folderId, depth = 6) {
  const docs = [];
  let level = [{ id: folderId, path: '' }];
  for (let d = 0; d < depth && level.length; d++) {
    const next = [];
    for (const f of level) {
      for (const x of await listQuery(`'${f.id}' in parents and trashed=false`)) {
        // ярлыки (shortcut) ведут на настоящий файл или папку — идём по ним тоже
        const sc = x.mimeType === SHORTCUT ? x.shortcutDetails : null;
        const mime = sc ? sc.targetMimeType : x.mimeType, id = sc ? sc.targetId : x.id;
        if (mime === MIME.folder) next.push({ id, path: f.path ? `${f.path} / ${x.name}` : x.name });
        else if (isDoc(mime)) docs.push({ ...x, id, mimeType: mime, path: f.path });
      }
    }
    level = next;
  }
  return docs.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

// Поиск документов по названию по всему Диску (включая «Доступные мне»)
export async function searchDocs(name) {
  if (isLocalDev) return mock.search(name);
  const found = await listQuery(`name contains '${q(name)}' and (mimeType='${MIME.doc}' or mimeType='${MIME.docx}') and trashed=false`);
  return found.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
}

export async function fileMeta(id) {
  if (isLocalDev) return mock.meta(id);
  return (await gfetch(`${DRIVE}/${id}?fields=${FIELDS}&supportsAllDrives=true`)).json();
}

let jszip;
export const loadJsZip = () => (jszip ||= new Promise((res, rej) => {
  const s = document.createElement('script');
  s.src = new URL('../../js/vendor/jszip.min.js', import.meta.url).href; // библиотека лежит в самом приложении
  s.onload = () => res(window.JSZip); s.onerror = () => { jszip = null; rej(new Error('Не загрузился модуль для Word')); };
  document.head.appendChild(s);
}));

// Знаки в файле книги: {total, tabs}
export async function countFile(file) {
  if (isLocalDev) return mock.count(file);
  if (file.mimeType === MIME.doc) {
    const j = await (await gfetch(`https://docs.googleapis.com/v1/documents/${file.id}?includeTabsContent=true`)).json();
    return charsFromDocsJson(j);
  }
  const buf = await (await gfetch(`${DRIVE}/${file.id}?alt=media&supportsAllDrives=true`)).arrayBuffer();
  const Zip = await loadJsZip();
  const xml = await (await Zip.loadAsync(buf)).file('word/document.xml').async('string');
  return { total: charsFromDocxXml(xml), tabs: [] };
}

// Сколько знаков прибавилось в файле с начала каждого из дней dates (по истории версий Google Диска).
// Возвращает {дата: прирост | null}. Правок после полуночи этой даты не было — 0; узнать нельзя — null.
// Обе версии считаются одинаково (выгрузка текста), поэтому разница честная.
export async function gainsSince(file, dates) {
  const out = Object.fromEntries(dates.map((d) => [d, null]));
  if (isLocalDev) return out;
  const j = await (await gfetch(`${DRIVE}/${file.id}/revisions?fields=revisions(id,modifiedTime,exportLinks)&pageSize=1000`)).json();
  const revs = (j.revisions || []).sort((a, b) => a.modifiedTime.localeCompare(b.modifiedTime));
  if (!revs.length) return out;
  const last = revs[revs.length - 1];
  const memo = new Map();
  const textOf = async (rev) => {
    if (memo.has(rev.id)) return memo.get(rev.id);
    let n;
    if (file.mimeType === MIME.doc) {
      const url = rev.exportLinks?.['text/plain'];
      if (!url) throw new Error('нет выгрузки версии');
      n = countPlain(await (await gfetch(url)).text());
    } else {
      const buf = await (await gfetch(`${DRIVE}/${file.id}/revisions/${rev.id}?alt=media`)).arrayBuffer();
      const Zip = await loadJsZip();
      n = charsFromDocxXml(await (await Zip.loadAsync(buf)).file('word/document.xml').async('string'));
    }
    memo.set(rev.id, n);
    return n;
  };
  for (const d of dates) {
    const midnight = new Date(d + 'T00:00:00').toISOString();
    if (last.modifiedTime < midnight) { out[d] = 0; continue; } // после этой даты файл не меняли
    const before = [...revs].reverse().find((r) => r.modifiedTime < midnight);
    if (!before) continue; // файл появился позже — честно не посчитать
    out[d] = (await textOf(last)) - (await textOf(before));
  }
  return out;
}
const countPlain = (t) => (t || '').replace(/^\uFEFF/, '').replace(/[\r\n\u000b\u000c\u2028\u2029]/g, '').length;

function multipart(meta, body, mime) {
  const b = 'pinkboundary' + Math.random().toString(36).slice(2);
  const blob = new Blob([`--${b}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${b}\r\nContent-Type: ${mime}\r\n\r\n`, body, `\r\n--${b}--`]);
  return { blob, type: `multipart/related; boundary=${b}` };
}
async function upload(meta, body, mime) {
  if (isLocalDev) return mock.create(meta);
  const { blob, type } = multipart(meta, body, mime);
  return (await gfetch(`https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=${FIELDS}&supportsAllDrives=true`, { method: 'POST', headers: { 'Content-Type': type }, body: blob })).json();
}
// Новый Google Документ (текст можно передать сразу)
export const createDoc = (name, folderId, text = '') => upload({ name, mimeType: MIME.doc, parents: folderId ? [folderId] : [] }, text || ' ', 'text/plain; charset=UTF-8');
export const uploadFile = (blob, name, folderId) => upload({ name, parents: folderId ? [folderId] : [] }, blob, blob.type || 'application/octet-stream');
export async function createFolder(name, parentId) {
  if (isLocalDev) return mock.create({ name, mimeType: MIME.folder, parents: parentId ? [parentId] : [] });
  return (await gfetch(`${DRIVE}?fields=${FIELDS}&supportsAllDrives=true`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, mimeType: MIME.folder, parents: parentId ? [parentId] : [] }) })).json();
}

// Папка name внутри parentId: найти или создать
export async function ensureFolder(name, parentId) {
  if (isLocalDev) return mock.ensureFolder(name, parentId);
  const found = await listQuery(`mimeType='${MIME.folder}' and name='${q(name)}' and '${parentId}' in parents and trashed=false`);
  return found[0] || createFolder(name, parentId);
}
// Файл с Диска как Blob (Google Документ — в формате Word)
export async function fileBlob(file) {
  if (isLocalDev) return new Blob([`(пробный файл) ${file.name}`], { type: 'text/plain' });
  if (file.mimeType === MIME.doc) return (await gfetch(`${DRIVE}/${file.id}/export?mimeType=${encodeURIComponent(MIME.docx)}`)).blob();
  return (await gfetch(`${DRIVE}/${file.id}?alt=media&supportsAllDrives=true`)).blob();
}

// ---------- пробный «диск» для проверки на localhost ----------
const mock = (() => {
  const t = '2026-10-05T10:00:00Z';
  const files = [
    { id: 'f_litnet', name: 'Литнет', mimeType: MIME.folder, parents: ['root'] },
    { id: 'd_alp', name: 'Альпийский развод. Он оставил меня умирать', mimeType: MIME.doc, parents: ['f_litnet'], modifiedTime: t },
    { id: 'f_zv', name: 'Звериная тропа', mimeType: MIME.folder, parents: ['f_litnet'] },
    { id: 'd_zv', name: 'Звериная тропа для двоих', mimeType: MIME.docx, parents: ['f_zv'], modifiedTime: t },
    { id: 'd_syn', name: 'Синопсис — идеи', mimeType: MIME.doc, parents: ['f_litnet'], modifiedTime: t },
  ];
  const counts = { d_alp: { total: 312400, tabs: [{ title: 'Глава 1', chars: 15200 }, { title: 'Глава 2', chars: 16800 }] }, d_zv: { total: 188000, tabs: [] } };
  const link = (f) => ({ ...f, webViewLink: `https://docs.google.com/document/d/${f.id}/edit` });
  return {
    query(s) {
      const m = /'([^']+)' in parents/.exec(s);
      if (m) return files.filter((f) => f.parents.includes(m[1])).map(link);
      const n = /name contains '([^']*)'/.exec(s);
      return files.filter((f) => f.mimeType === MIME.folder && (!n || f.name.includes(n[1]))).map(link);
    },
    ensureFolder(name, parent) { const f = files.find((x) => x.mimeType === MIME.folder && x.name === name && x.parents.includes(parent)); return link(f || this.create({ name, mimeType: MIME.folder, parents: [parent] })); },
    search: (n) => files.filter((f) => isDoc(f.mimeType) && f.name.toLowerCase().includes(n.toLowerCase())).map(link),
    meta: (id) => link(files.find((f) => f.id === id) || { id, name: '?', mimeType: MIME.doc, parents: [] }),
    count: (f) => counts[f.id] || { total: 1000, tabs: [] },
    create(meta) { const f = { id: 'm' + Math.random().toString(36).slice(2, 8), modifiedTime: new Date().toISOString(), mimeType: meta.mimeType || 'image/jpeg', ...meta }; files.push(f); return link(f); },
  };
})();
