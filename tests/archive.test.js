import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { thinKeep, scriptCode, archiveStatus, copiesWithDiff, bookChars, INDEX_NAME } from '../writer/js/archive.js';

test('архив: прореживание — 30 дней все, до полугода по неделе, дальше по месяцу', () => {
  const dates = [];
  for (let d = new Date('2025-10-01T00:00:00Z'); d <= new Date('2026-10-16T00:00:00Z'); d = new Date(d.getTime() + 864e5)) dates.push(d.toISOString().slice(0, 10));
  const keep = thinKeep(dates, '2026-10-16');
  assert.equal(keep.filter((d) => d >= '2026-09-16').length, 31); // последние 30 дней + сегодня
  const mid = keep.filter((d) => d < '2026-09-16' && d >= '2026-04-16');
  assert.ok(mid.length >= 21 && mid.length <= 24, String(mid.length)); // по одной в неделю (~22 недели)
  const old = keep.filter((d) => d < '2026-04-15');
  assert.deepEqual(old.map((d) => d.slice(0, 7)), [...new Set(old.map((d) => d.slice(0, 7)))]); // по одной в месяц
  assert.ok(old.includes('2025-10-31'));
});

test('архив: знаки книги — только главы, служебные вкладки не считаются', () => {
  assert.equal(bookChars([{ title: 'Глава 1', chars: 100 }, { title: 'Каркас', chars: 50 }, { title: 'Пролог', chars: 10 }]), 110);
  assert.equal(bookChars([{ title: 'Черновик', chars: 70 }, { title: 'Персонажи', chars: 50 }]), 70);
});

// заглушка Google Диска для программы
function fakeGoogle() {
  let n = 0;
  const files = {}, folders = {}, triggers = [], props = {}, fetches = [];
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const mkFolder = (name, parent) => {
    const id = 'F' + ++n;
    const f = folders[id] = { id, name, parent,
      getId: () => id, getName: () => name,
      getFiles: () => iter(Object.values(files).filter((x) => x.parent === id && !x.trashed)),
      getFolders: () => iter(Object.values(folders).filter((x) => x.parent === id)),
      getFoldersByName: (nm) => iter(Object.values(folders).filter((x) => x.parent === id && x.name === nm)),
      getFilesByName: (nm) => iter(Object.values(files).filter((x) => x.parent === id && x.name === nm && !x.trashed)),
      createFolder: (nm) => mkFolder(nm, id),
      createFile: (a, text) => (typeof a === 'string' ? mkFile(a, 'application/json', id, text) : mkFile(a.name, 'docx', id, '')),
      getParents: () => iter(f.parent ? [folders[f.parent]] : []),
      moveTo: (to) => { f.parent = to.getId(); },
    };
    return f;
  };
  const mkFile = (name, mime, parent, text, tabs) => {
    const id = 'D' + ++n;
    const f = files[id] = { id, name, mime, parent, text, tabs, updated: Date.now(), trashed: false,
      getId: () => id, getName: () => f.name, getMimeType: () => mime, getLastUpdated: () => new Date(f.updated),
      makeCopy: (nm, dir) => mkFile(nm, mime, dir.getId(), f.text, f.tabs),
      setTrashed: (v) => { f.trashed = v; },
      setContent: (t) => { f.text = t; },
      getBlob: () => ({ getDataAsString: () => f.text }),
    };
    return f;
  };
  const root = mkFolder('Мой диск', null), books = mkFolder('Литнет', root.id), sub = mkFolder('Звериная тропа', books.id);
  // абзацы вкладки: [текст, заголовок, жирный с какого знака]
  const para = ([t, h = 'NORMAL', boldFrom = -1]) => ({ getHeading: () => h, editAsText: () => ({ getText: () => t, getTextAttributeIndices: () => (boldFrom > 0 ? [0, boldFrom] : [0]), isBold: (i) => boldFrom > 0 && i >= boldFrom, isItalic: () => false }) });
  const tab = (title, text, paras = text.split('\n').map((x) => [x])) => ({ getType: () => 'DOC', getTitle: () => title, asDocumentTab: () => ({ getBody: () => ({ getText: () => text, getParagraphs: () => paras.map(para) }) }), getChildTabs: () => [] });
  const doc = mkFile('Альпийский развод', 'gdoc', books.id, '', [tab('Глава 1', 'Глава 1\nСнег шёл.', [['Глава 1'], ['Снег шёл.', 'NORMAL', 5]]), tab('Каркас', 'план')]);
  mkFile('Звериная тропа для двоих', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', sub.id, '');
  mkFile('обложка.png', 'image/png', books.id, '');
  const ctx = {
    console, Date, JSON, Math, Object, String,
    DriveApp: { getRootFolder: () => root, getFolderById: (id) => folders[id], getFileById: (id) => files[id] },
    DocumentApp: { TabType: { DOCUMENT_TAB: 'DOC' }, openById: (id) => ({ getTabs: () => files[id].tabs }) },
    MimeType: { GOOGLE_DOCS: 'gdoc' },
    PropertiesService: { getScriptProperties: () => ({ getProperty: (k) => props[k] ?? null, setProperty: (k, v) => { props[k] = v; }, deleteProperty: (k) => { delete props[k]; } }) },
    ScriptApp: {
      getProjectTriggers: () => triggers, deleteTrigger: (t) => triggers.splice(triggers.indexOf(t), 1), getOAuthToken: () => 'tok',
      newTrigger: (h) => { const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, after: () => b, create: () => triggers.push({ getHandlerFunction: () => h }) }; return b; },
    },
    UrlFetchApp: { fetch: (url, o = {}) => {
      fetches.push({ url, o });
      if (url.includes('docs.google.com')) return { getBlob: () => ({ setName: (nm) => ({ name: nm }) }) };
      const path = url.replace(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+/, '');
      const body = path === '' ? { default_branch: 'main' } : path.startsWith('/git/ref/') ? { object: { sha: 'c1' } } : path.startsWith('/git/commits/') ? { tree: { sha: 't1' } }
        : path.startsWith('/git/trees/') ? { tree: [{ type: 'blob', path: 'Альпийский развод/03 Старая глава.md' }, { type: 'blob', path: 'README.md' }, { type: 'blob', path: 'Звериная тропа для двоих/01 Глава.md' }] } : path === '/git/trees' ? { sha: 't2' } : path === '/git/commits' ? { sha: 'c2' } : {};
      return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
    } },
    Utilities: { formatDate: (d) => d.toISOString().slice(0, 10), base64Encode: (t) => Buffer.from(t).toString('base64'), Charset: { UTF_8: 'utf8' } },
    Session: { getScriptTimeZone: () => 'Europe/Moscow' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) },
  };
  return { ctx, files, folders, triggers, props, fetches, books, doc, root };
}

test('архив: программа Google копирует книги, пишет оглавление, копия в GitHub', () => {
  const g = fakeGoogle();
  const code = scriptCode(g.books.id);
  assert.ok(!/ghp_|github_pat_/.test(code)); // ключей в тексте программы нет
  vm.createContext(g.ctx);
  vm.runInContext(code, g.ctx);
  vm.runInContext('setup()', g.ctx); // первый запуск — ключа GitHub ещё нет
  assert.equal(g.fetches.filter((f) => f.url.includes('api.github.com')).length, 0);
  const copiesBefore = Object.keys(g.files).length;
  // ключ вписали позже (и ссылкой целиком) — книги без изменений всё равно уходят в GitHub, лишних копий на Диске нет
  g.props.GITHUB_TOKEN = ' secret '; g.props.GITHUB_REPO = 'https://github.com/me/arhiv';
  vm.runInContext('nightly()', g.ctx);
  assert.equal(Object.keys(g.files).length, copiesBefore);
  assert.ok(g.fetches.some((f) => f.url.startsWith('https://api.github.com/repos/me/arhiv/git/trees')));
  assert.equal(g.triggers.length, 1);
  const idxFile = Object.values(g.files).find((f) => f.name === INDEX_NAME);
  const idx = JSON.parse(idxFile.text);
  const books = Object.values(idx.books);
  assert.equal(books.length, 2); // документ и Word из подпапки; картинка — нет
  const alp = idx.books[g.doc.id];
  assert.equal(alp.copies.length, 1);
  assert.equal(alp.copies[0].chars, 16); // только «Глава 1» (вместе с названием), «Каркас» не считается
  assert.ok(alp.copies[0].docId && alp.copies[0].docxId);
  assert.equal(idx.books[books.find((b) => b.kind === 'docx').id].copies[0].docxId != null, true);
  assert.equal(idx.github.ok, true);
  const tree = JSON.parse(g.fetches.find((f) => f.url.endsWith('/git/trees') && f.o.method === 'post').o.payload).tree;
  // старое расположение (без папок Диска) убрано из текущей версии, README остаётся
  assert.deepEqual(tree.map((t) => t.path), ['Альпийский развод/01 Глава 1.md', 'Альпийский развод/02 Каркас.md', 'Альпийский развод/00 Книга целиком.md', 'Альпийский развод/03 Старая глава.md', 'Звериная тропа для двоих/01 Глава.md']);
  assert.equal(tree[4].sha, null);
  // в архиве на Диске — те же папки, что на Диске: Word из подпапки лежит в «Звериная тропа»
  const zv = books.find((b) => b.kind === 'docx'), zvDir = g.folders[zv.folderId];
  assert.equal(g.folders[zvDir.parent].name, 'Звериная тропа');
  assert.equal(zv.path, 'Звериная тропа');
  assert.equal(tree[0].content, '# Глава 1\n\nСнег **шёл.**\n'); // абзацы и жирный как в Документе, название не повторяется
  assert.equal(tree[2].content, '# Альпийский развод\n\n# Глава 1\n\nСнег **шёл.**\n'); // книга целиком — без служебных вкладок
  assert.equal(tree[3].sha, null); // удалённая глава убрана из текущей версии
  // следующая ночь без изменений — ни копий, ни отправки в GitHub, но отметка о запуске свежая
  const before = Object.keys(g.files).length, sent = g.fetches.length;
  vm.runInContext('nightly()', g.ctx);
  assert.equal(Object.keys(g.files).length, before);
  assert.equal(g.fetches.length, sent);
  assert.ok(JSON.parse(idxFile.text).lastRun);
});

test('архив: старые копии сами переезжают в папки, как на Диске', () => {
  const g = fakeGoogle();
  vm.createContext(g.ctx);
  vm.runInContext(scriptCode(g.books.id), g.ctx);
  vm.runInContext('setup()', g.ctx);
  const idxFile = Object.values(g.files).find((f) => f.name === INDEX_NAME);
  const zv = Object.values(JSON.parse(idxFile.text).books).find((b) => b.kind === 'docx');
  const arch = Object.values(g.folders).find((f) => f.name === 'Архив Мастерской');
  // как было в старой версии: папка документа прямо в корне архива, рядом — папка «Звериная тропа» с тем же уровнем
  g.folders[zv.folderId].parent = arch.id;
  g.props.drivev = '3';
  vm.runInContext('nightly()', g.ctx);
  const parent = g.folders[g.folders[zv.folderId].parent];
  assert.equal(parent.name, 'Звериная тропа'); assert.equal(parent.parent, arch.id);
  assert.equal(Object.values(g.folders).filter((f) => f.name === 'Звериная тропа' && f.parent === arch.id).length, 1); // без дублей
});

test('архив: статус и разница в знаках', () => {
  const now = Date.parse('2026-10-16T12:00:00Z');
  assert.equal(archiveStatus({ lastRun: '2026-10-16T03:00:00Z', errors: [] }, now).warn, false);
  assert.equal(archiveStatus({ lastRun: '2026-10-13T03:00:00Z', errors: [] }, now).warn, true);
  assert.equal(archiveStatus(null, now).none, true);
  const c = copiesWithDiff({ copies: [{ date: '2026-10-14', chars: 1000 }, { date: '2026-10-16', chars: 1500 }] });
  assert.deepEqual(c.map((x) => [x.date, x.diff]), [['2026-10-16', 500], ['2026-10-14', null]]);
});
