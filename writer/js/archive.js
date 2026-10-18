// «Архив книг»: ночная программа Google (Apps Script) копирует книги и черновики из папки с книгами в папку
// «Архив Мастерской» на Диске (копия Google Документа + Word), прореживает старые копии и пишет оглавление —
// его читает Мастерская (Настройки → «Архив книг»). Тексты глав по желанию уходят в закрытое хранилище GitHub
// с историей правок. Ключ GitHub хранится только в «Свойствах скрипта» у владелицы — ни в приложении, ни здесь.
// Функции программы ниже — обычный JS: в браузере они не запускаются, а превращаются в текст (scriptCode)
// и проверяются тестами на заглушках Google.

export const ARCHIVE_NAME = 'Архив Мастерской';
export const INDEX_NAME = 'Архив Мастерской — оглавление.json';
export const STALE_DAYS = 2;
// версия программы Google: выросла — приложение попросит вставить программу заново
export const SCRIPT_V = 4; // 3 — главы с разметкой и «Книга целиком»; 4 — архив повторяет папки Диска

// какие копии оставить: за 30 дней — все, до полугода — по одной в неделю, дальше — по одной в месяц (навсегда)
export function thinKeep(dates, today) {
  var day = 864e5, t = Date.parse(today + 'T00:00:00Z'), seen = {}, keep = [];
  dates.slice().sort().reverse().forEach(function (d) {
    var at = Date.parse(d + 'T00:00:00Z'), age = (t - at) / day, key;
    if (age <= 30) key = 'd' + d;
    else if (age <= 183) key = 'w' + new Date(at - ((new Date(at).getUTCDay() + 6) % 7) * day).toISOString().slice(0, 10);
    else key = 'm' + d.slice(0, 7);
    if (!seen[key]) { seen[key] = 1; keep.push(d); }
  });
  return keep;
}
export function safeName(s) { return String(s || '').replace(/[\\/:*?"<>|#\r\n\t]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 100) || 'Без названия'; }
// вкладки рукописи — как в приложении: Пролог, Главы, Эпилог («От автора» — по желанию);
// документ из одной вкладки — целиком; промты, каркас и черновики не входят
export function bookTabs(tabs, withAuthor) {
  var svc = function (t) { return /^\s*(идея|каркас|персонажи|синопсис|аннотац|промт|промпт)/i.test(t); };
  if (tabs.length === 1 && !svc(tabs[0].title)) return tabs;
  return tabs.filter(function (t) { return /^\s*(пролог|глава|эпилог)/i.test(t.title) || (withAuthor && /^\s*от автора/i.test(t.title)); });
}
export function bookChars(tabs) {
  return bookTabs(tabs, false).reduce(function (a, t) { return a + t.chars; }, 0);
}
// абзац Документа → Markdown: заголовки, жирный, курсив; спецсимволы экранируем
export function paraMd(text, runs, heading) {
  if (!String(text).trim()) return '';
  var out = '';
  runs.forEach(function (r) {
    var seg = text.slice(r.a, r.b).replace(/([\\*_`])/g, '\\$1');
    if (!seg) return;
    var m = /^(\s*)([\s\S]*?)(\s*)$/.exec(seg), w = r.b2 && r.i2 ? '***' : r.b2 ? '**' : r.i2 ? '*' : '';
    out += w && m[2] ? m[1] + w + m[2] + w + m[3] : seg;
  });
  out = out.replace(/[\r\u000b]/g, '  \n');
  var h = { HEADING1: '# ', TITLE: '# ', HEADING2: '## ', SUBTITLE: '## ', HEADING3: '### ', HEADING4: '#### ', HEADING5: '##### ', HEADING6: '###### ' }[String(heading)] || '';
  if (!h) out = out.replace(/^(\s*)([#>+-])/, '$1\\$2').replace(/^(\s*\d+)([.)])/, '$1\\$2'); // строка не должна стать заголовком или списком
  return h + out;
}

// ---------------- программа Google (Apps Script) ----------------
/* global DriveApp, DocumentApp, MimeType, PropertiesService, ScriptApp, UrlFetchApp, Utilities, Session, LockService, BOOKS_FOLDER_ID */
const DOCX = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (/^(nightly|more)$/.test(t.getHandlerFunction())) ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('nightly').timeBased().everyDays(1).atHour(3).create();
  nightly();
}
// продолжение, если за один запуск всё не успело (у Google лимит 6 минут)
function more() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'more') ScriptApp.deleteTrigger(t); });
  nightly();
}
function nightly() {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try { runBackup(); } finally { lock.releaseLock(); }
}
function runBackup() {
  var started = Date.now(), props = PropertiesService.getScriptProperties();
  var state = JSON.parse(props.getProperty('state') || '{}');
  var archive = folderIn(DriveApp.getRootFolder(), ARCHIVE_NAME);
  var index = readIndex(archive);
  var stamp = Utilities.formatDate(new Date(), Session.getScriptTimeZone() || 'Europe/Moscow', 'yyyy-MM-dd');
  var ghFresh = props.getProperty('ghv') !== String(SCRIPT_V);
  var ghState = ghFresh ? {} : JSON.parse(props.getProperty('ghstate') || '{}'); // новая версия — переотправить всё в новом виде
  if (ghFresh) props.setProperty('ghclean', '1'); // и убрать из текущей версии старое расположение файлов
  var withGh = !!(props.getProperty('GITHUB_TOKEN') && props.getProperty('GITHUB_REPO'));
  var errors = [], files = [], gh = [], left = false;
  walk(DriveApp.getFolderById(BOOKS_FOLDER_ID), '', files, 0, archive.getId());
  // папки документов в архиве (чтобы не спутать их с папками Диска с тем же названием)
  var docFolders = {};
  Object.keys(index.books).forEach(function (id) { if (index.books[id].folderId) docFolders[index.books[id].folderId] = 1; });
  // новая версия программы: разложить уже сделанные копии по папкам, как на Диске
  if (props.getProperty('drivev') !== String(SCRIPT_V)) {
    files.forEach(function (f) { var b = index.books[f.id]; if (b && b.folderId) { try { archiveDir(archive, f, b, docFolders); b.path = f.path; } catch (e) { errors.push(f.name + ': ' + (e && e.message || e)); } } });
    props.setProperty('drivev', String(SCRIPT_V));
  }
  for (var i = 0; i < files.length; i++) {
    var f = files[i];
    if (Date.now() - started > 4.5 * 60 * 1000) { left = true; break; }
    try {
      var upd = f.file.getLastUpdated().getTime();
      var needCopy = !(state[f.id] >= upd);
      // в GitHub — всё, чего там ещё нет в этой версии (даже если копия на Диске уже есть)
      var needGh = withGh && f.mime !== DOCX && !(ghState[f.id] >= upd);
      if (!needCopy && !needGh) continue;
      var tabs = f.mime !== DOCX ? docTabs(f.id) : null;
      if (needGh) gh.push({ id: f.id, upd: upd, name: f.name, path: f.path, tabs: tabs });
      if (!needCopy) continue;
      var book = index.books[f.id] || (index.books[f.id] = { id: f.id, copies: [] });
      book.name = f.name; book.path = f.path; book.kind = f.mime === DOCX ? 'docx' : 'doc';
      var dir = archiveDir(archive, f, book, docFolders);
      book.folderId = dir.getId();
      // повторная копия за тот же день заменяет утреннюю
      book.copies.filter(function (c) { return c.date === stamp; }).forEach(trashCopy);
      book.copies = book.copies.filter(function (c) { return c.date !== stamp; });
      var copy = { date: stamp, at: new Date().toISOString() };
      if (book.kind === 'doc') {
        copy.docId = f.file.makeCopy(stamp + ' ' + f.name, dir).getId();
        var url = 'https://docs.google.com/document/d/' + f.id + '/export?format=docx';
        var blob = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() } }).getBlob();
        copy.docxId = dir.createFile(blob.setName(stamp + ' ' + f.name + '.docx')).getId();
        copy.chars = bookChars(tabs);
      } else {
        copy.docxId = f.file.makeCopy(stamp + ' ' + f.name, dir).getId();
      }
      book.copies.push(copy);
      state[f.id] = upd;
    } catch (e) { errors.push(f.name + ': ' + (e && e.message || e)); }
  }
  // прореживание: старые копии уходят в корзину Диска (там ещё 30 дней)
  Object.keys(index.books).forEach(function (id) {
    var b = index.books[id], keep = thinKeep(b.copies.map(function (c) { return c.date; }), stamp);
    b.copies.filter(function (c) { return keep.indexOf(c.date) < 0; }).forEach(trashCopy);
    b.copies = b.copies.filter(function (c) { return keep.indexOf(c.date) >= 0; }).sort(function (a, c) { return a.date < c.date ? 1 : -1; });
  });
  if (gh.length) {
    try {
      var clean = !left && props.getProperty('ghclean') === '1';
      var msg = pushGithub(gh, stamp, props, clean ? files.map(ghDir) : null);
      if (clean) props.deleteProperty('ghclean');
      gh.forEach(function (x) { ghState[x.id] = x.upd; });
      props.setProperty('ghstate', JSON.stringify(ghState)); props.setProperty('ghv', String(SCRIPT_V));
      index.github = { repo: props.getProperty('GITHUB_REPO'), at: new Date().toISOString(), ok: true, msg: msg };
    } catch (e) { index.github = { repo: props.getProperty('GITHUB_REPO'), at: new Date().toISOString(), ok: false, msg: String(e && e.message || e).slice(0, 300) }; }
  }
  index.folderId = archive.getId(); index.source = BOOKS_FOLDER_ID; index.sv = SCRIPT_V;
  index.lastRun = new Date().toISOString(); index.errors = errors; index.left = left; index.total = files.length;
  writeIndex(archive, index);
  props.setProperty('state', JSON.stringify(state));
  if (left) ScriptApp.newTrigger('more').timeBased().after(60 * 1000).create();
}
function walk(folder, path, out, depth, skipId) {
  var it = folder.getFiles();
  while (it.hasNext()) {
    var file = it.next(), mime = file.getMimeType();
    if (mime === 'application/vnd.google-apps.shortcut') {
      try { file = DriveApp.getFileById(file.getTargetId()); mime = file.getMimeType(); } catch (e) { continue; }
    }
    if (mime !== MimeType.GOOGLE_DOCS && mime !== DOCX) continue;
    if (out.some(function (x) { return x.id === file.getId(); })) continue;
    out.push({ id: file.getId(), name: file.getName(), path: path, mime: mime, file: file });
  }
  if (depth >= 6) return;
  var subs = folder.getFolders();
  while (subs.hasNext()) {
    var sub = subs.next();
    if (sub.getId() === skipId) continue;
    walk(sub, path ? path + ' / ' + sub.getName() : sub.getName(), out, depth + 1, skipId);
  }
}
function docTabs(id) {
  var out = [];
  var add = function (list) {
    list.forEach(function (t) {
      if (t.getType() === DocumentApp.TabType.DOCUMENT_TAB) {
        var body = t.asDocumentTab().getBody(), text = body.getText();
        // каждый абзац — отдельным абзацем Markdown (через пустую строку), с жирным и курсивом как в Документе
        var md = body.getParagraphs().map(function (p) {
          var x = p.editAsText(), s2 = x.getText(), idx = x.getTextAttributeIndices() || [0];
          var runs = idx.map(function (a, i) { return { a: a, b: i + 1 < idx.length ? idx[i + 1] : s2.length, b2: !!x.isBold(a), i2: !!x.isItalic(a) }; });
          return paraMd(s2, runs, p.getHeading ? p.getHeading() : '');
        }).filter(function (l) { return l; }).join('\n\n');
        out.push({ title: t.getTitle(), text: text, md: md, chars: text.replace(/[\r\n\u000b\u000c\u2028\u2029]/g, '').length });
      }
      add(t.getChildTabs());
    });
  };
  add(DocumentApp.openById(id).getTabs());
  return out;
}
// папка документа в архиве — как на Диске: «Подпапка / Документ»; уже существующую папку переносим на место
function archiveDir(archive, f, book, docFolders) {
  var parent = archive;
  (f.path ? f.path.split(' / ') : []).forEach(function (p) {
    var it = parent.getFoldersByName(safeName(p)), found = null;
    while (it.hasNext() && !found) { var x = it.next(); if (!docFolders[x.getId()]) found = x; }
    parent = found || parent.createFolder(safeName(p));
  });
  if (book.folderId) {
    try {
      var own = DriveApp.getFolderById(book.folderId), ps = own.getParents(), here = ps.hasNext() ? ps.next().getId() : '';
      if (here !== parent.getId()) own.moveTo(parent);
      return own;
    } catch (e) { /* папку удалили — создадим новую */ }
  }
  var d = parent.createFolder(safeName(f.name));
  docFolders[d.getId()] = 1;
  return d;
}
// путь документа в GitHub — тоже как на Диске
function ghDir(x) { return (x.path ? x.path.split(' / ').map(safeName).join('/') + '/' : '') + safeName(x.name) + '/'; }
function folderIn(parent, name) {
  var it = parent.getFoldersByName(name);
  return it.hasNext() ? it.next() : parent.createFolder(name);
}
function readIndex(archive) {
  var it = archive.getFilesByName(INDEX_NAME);
  if (it.hasNext()) { try { return JSON.parse(it.next().getBlob().getDataAsString()); } catch (e) { /* испорчен — начнём заново */ } }
  return { v: 1, books: {} };
}
function writeIndex(archive, index) {
  var it = archive.getFilesByName(INDEX_NAME), text = JSON.stringify(index);
  if (it.hasNext()) it.next().setContent(text); else archive.createFile(INDEX_NAME, text, 'application/json');
}
function trashCopy(c) {
  [c.docId, c.docxId].forEach(function (id) { if (id) { try { DriveApp.getFileById(id).setTrashed(true); } catch (e) { /* уже нет */ } } });
}
// копия вне Google: тексты вкладок → закрытое хранилище GitHub, одной правкой за ночь (история — в самом GitHub)
function pushGithub(items, stamp, props, keepDirs) {
  var token = String(props.getProperty('GITHUB_TOKEN') || '').trim();
  var repo = String(props.getProperty('GITHUB_REPO') || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, '').replace(/\/+$/, '');
  if (!token || !repo) return '';
  var api = function (path, method, body) {
    var o = { method: method || 'get', muteHttpExceptions: true, headers: { Authorization: 'Bearer ' + token, Accept: 'application/vnd.github+json' } };
    if (body) { o.contentType = 'application/json'; o.payload = JSON.stringify(body); }
    var r = UrlFetchApp.fetch('https://api.github.com/repos/' + repo + path, o), code = r.getResponseCode();
    if (code >= 300) throw new Error('GitHub ' + code + ': ' + r.getContentText().slice(0, 200));
    return JSON.parse(r.getContentText() || '{}');
  };
  var branch = api('').default_branch || 'main', parent;
  try { parent = api('/git/ref/heads/' + branch).object.sha; } catch (e) {
    // хранилище создано без README — кладём первый файл, чтобы появилась ветка
    api('/contents/README.md', 'put', { message: 'Архив книг', content: Utilities.base64Encode('# Архив книг\n', Utilities.Charset.UTF_8), branch: branch });
    parent = api('/git/ref/heads/' + branch).object.sha;
  }
  var base = api('/git/commits/' + parent).tree.sha;
  var old = api('/git/trees/' + base + '?recursive=1').tree || [], tree = [], pad = function (n) { return n < 10 ? '0' + n : String(n); };
  items.forEach(function (x) {
    var dir = ghDir(x), now = {};
    var plain = function (v) { return String(v).replace(/[#*\\\s.]+/g, ' ').trim().toLowerCase(); };
    var mdOf = function (t) {
      var md = t.md != null ? t.md : t.text, first = md.split('\n\n')[0];
      if (/^#/.test(md)) return md;
      // первая строка главы и есть её название («Глава 6») — делаем её заголовком, а не повторяем
      if (plain(first) === plain(t.title)) md = md.slice(first.length).replace(/^\n+/, '');
      return '# ' + t.title + '\n\n' + md;
    };
    x.tabs.forEach(function (t, i) { var p = dir + pad(i + 1) + ' ' + safeName(t.title) + '.md'; now[p] = 1; tree.push({ path: p, mode: '100644', type: 'blob', content: mdOf(t) + '\n' }); });
    // вся книга одним файлом: главы по порядку (без «От автора» и служебных вкладок) — удобно читать и скачать целиком
    var whole = dir + '00 Книга целиком.md';
    now[whole] = 1;
    tree.push({ path: whole, mode: '100644', type: 'blob', content: '# ' + x.name + '\n\n' + bookTabs(x.tabs, false).map(mdOf).join('\n\n---\n\n') + '\n' });
    // главы, которых больше нет (переименовали, удалили), убираем из текущей версии — в истории они остаются
    old.forEach(function (o) { if (o.type === 'blob' && o.path.indexOf(dir) === 0 && !now[o.path]) tree.push({ path: o.path, mode: '100644', type: 'blob', sha: null }); });
  });
  // после смены версии: всё, что лежит не на своём месте (старое расположение), убираем из текущей версии
  if (keepDirs) {
    var mine = {};
    tree.forEach(function (t) { mine[t.path] = 1; });
    old.forEach(function (o) { if (o.type === 'blob' && o.path !== 'README.md' && !mine[o.path] && !keepDirs.some(function (d) { return o.path.indexOf(d) === 0; })) tree.push({ path: o.path, mode: '100644', type: 'blob', sha: null }); });
  }
  var nt = api('/git/trees', 'post', { base_tree: base, tree: tree });
  if (nt.sha === base) return 'без изменений';
  var cm = api('/git/commits', 'post', { message: 'Копия ' + stamp + ': ' + items.map(function (x) { return x.name; }).join(', ').slice(0, 300), tree: nt.sha, parents: [parent] });
  api('/git/refs/heads/' + branch, 'patch', { sha: cm.sha });
  return 'сохранено';
}

// текст программы для вставки в Google Apps Script (папка с книгами уже подставлена)
export function scriptCode(folderId) {
  const fns = [setup, nightly, more, runBackup, walk, docTabs, archiveDir, ghDir, folderIn, readIndex, writeIndex, trashCopy, pushGithub, thinKeep, safeName, bookTabs, bookChars, paraMd];
  return [
    '// Архив Мастерской — ночная копия книг. Сделано для приложения «Мастерская».',
    '// Первый запуск: выберите вверху функцию setup и нажмите «Выполнить» (Google попросит разрешение один раз).',
    '// Копия в GitHub (по желанию): «Настройки проекта» → «Свойства скрипта» → GITHUB_TOKEN и GITHUB_REPO.',
    '',
    `var BOOKS_FOLDER_ID = ${JSON.stringify(String(folderId || ''))};`,
    `var ARCHIVE_NAME = ${JSON.stringify(ARCHIVE_NAME)};`,
    `var INDEX_NAME = ${JSON.stringify(INDEX_NAME)};`,
    `var DOCX = ${JSON.stringify(DOCX)};`,
    `var SCRIPT_V = ${SCRIPT_V};`,
    '',
    ...fns.map((f) => f.toString() + '\n'),
  ].join('\n');
}

// ---------------- для экрана «Архив книг» ----------------
// давно ли была ночная копия: дни и нужно ли предупредить
export function archiveStatus(index, now = Date.now()) {
  if (!index?.lastRun) return { none: true, warn: true, days: Infinity };
  const days = Math.floor((now - Date.parse(index.lastRun)) / 864e5);
  return { days, warn: days >= STALE_DAYS || (index.errors || []).length > 0 || index.github?.ok === false };
}
// копии книги от новых к старым, с разницей в знаках к предыдущей копии
export function copiesWithDiff(book) {
  const list = [...(book?.copies || [])].sort((a, b) => (a.date < b.date ? 1 : -1));
  return list.map((c, i) => ({ ...c, diff: c.chars != null && list[i + 1]?.chars != null ? c.chars - list[i + 1].chars : null }));
}
