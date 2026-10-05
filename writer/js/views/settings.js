import { esc, acts, forms, changes, openSheet, opt, toast, download, ask } from '../../../js/ui.js';
import * as drive from '../drive.js';
import { WCOLLS } from '../app.js';

const app = () => window.__app;

export function settingsView(a) {
  const c = a.ctx(), s = c.settings, st = a.store;
  const folder = (id, name, act, label) => `<div class="item"><div class="small muted">${label}</div><div class="row between"><b>${id ? '📁 ' + esc(name || id) : 'не выбрана'}</b><button data-act="${act}">${id ? 'Сменить' : 'Выбрать'}</button></div></div>`;
  const html = `<p><a href="#" data-act="go" data-to="/">← Назад</a></p>
  <div class="card"><h2>Google Диск</h2>
    ${!drive.driveConfigured ? '<p>Диск ещё не подключён к приложению: нужен ключ Google. Инструкция — docs/SETUP-WRITER.md; пришлите ключ Claude, он вставит.</p>'
    : drive.isConnected() ? `<p><span class="badge good">● подключён на этом устройстве</span></p>
      ${folder(s.wBooksFolder, s.wBooksFolderName, 'set.booksFolder', 'Папка с книгами (подпапки тоже просматриваются)')}
      ${folder(s.wMarketingFolder, s.wMarketingFolderName, 'set.mkFolder', 'Папка для баннеров и обложек')}
      ${folder(s.wIdeasFolder, s.wIdeasFolderName, 'set.ideasFolder', 'Папка для документов из идей (по умолчанию — папка с книгами)')}
      <button class="danger" data-act="set.disconnect" style="margin-top:10px">Отключить Диск на этом устройстве</button>`
    : '<p>На этом устройстве Диск не подключён.</p><button class="primary" data-act="drive.connect">Подключить Google Диск</button>'}
    <p class="hint">Подключать нужно на каждом устройстве один раз. Google иногда просит подтвердить вход заново — это одно нажатие.</p></div>
  <div class="card"><h2>Резервная копия мастерской</h2><p class="small muted">Книги, идеи, планер и галерея (без самих файлов Диска — они и так на Диске).</p>
    <div class="row"><button class="primary" data-act="set.backup">Скачать копию</button><label class="btn">Восстановить<input type="file" accept=".json" data-chg="set.restore" hidden></label></div></div>
  <div class="card"><h2>Оформление и аккаунт</h2>
    <label for="th" style="margin-top:0">Тема</label><select id="th" data-chg="theme">${opt('auto', 'как в телефоне', a.theme)}${opt('light', 'светлая', a.theme)}${opt('dark', 'тёмная', a.theme)}</select>
    <p class="small muted" style="margin-top:12px">${st.mode === 'firebase' ? `Вы вошли как <b>${esc(st.user.email)}</b> — тот же вход, что в приложении доходов.` : 'Пробный режим.'}</p>
    ${st.mode === 'firebase' ? '<button data-act="auth.out">Выйти</button>' : ''}</div>`;
  return { html };
}

async function chooseFolder(key, title) {
  openSheet(title, `<label for="fq">Название папки (или его часть)</label><input id="fq" name="q" value="${key === 'wMarketingFolder' ? 'Маркетинг' : 'Литнет'}" required>
    ${key === 'wMarketingFolder' ? '<label class="check"><input type="checkbox" name="create">Если такой папки нет — создать её в папке с книгами</label>' : ''}`, async (fd) => {
    const name = fd.get('q').trim();
    try {
      let found = await drive.findFolders(name);
      if (!found.length && fd.get('create')) found = [await drive.createFolder(name, app().ctx().settings.wBooksFolder || undefined)];
      if (!found.length) { toast('Папка не найдена. Проверьте название.'); return false; }
      if (found.length === 1) { await app().store.saveSettings({ [key]: found[0].id, [key + 'Name']: found[0].name }); toast('Папка выбрана'); return; }
      setTimeout(() => openSheet('Какая из папок?', `<div class="list">${found.map((f) => `<div class="item row between"><span>📁 ${esc(f.name)}</span><button type="button" class="primary" data-act="set.pickFolder" data-key="${key}" data-id="${f.id}" data-name="${esc(f.name)}">Эта</button></div>`).join('')}</div>`, null), 0);
    } catch (e) { toast(e.message); return false; }
  }, { submitText: 'Найти' });
}
acts['set.booksFolder'] = () => chooseFolder('wBooksFolder', 'Папка с книгами');
acts['set.mkFolder'] = () => chooseFolder('wMarketingFolder', 'Папка для баннеров и обложек');
acts['set.ideasFolder'] = () => chooseFolder('wIdeasFolder', 'Папка для идей');
acts['set.pickFolder'] = async (d) => { await app().store.saveSettings({ [d.key]: d.id, [d.key + 'Name']: d.name }); document.getElementById('sheet').close(); toast('Папка выбрана'); };
acts['set.disconnect'] = async () => { if (await ask('Отключить Google Диск на этом устройстве?', 'Отключить')) { drive.disconnect(); toast('Диск отключён'); } };
acts['auth.out'] = () => app().store.signOut();
changes.theme = (v) => app().setTheme(v);
acts['set.backup'] = async () => {
  const d = app().store.data;
  const out = { app: 'author-writer', version: 1, exportedAt: new Date().toISOString() };
  for (const k of WCOLLS) out[k] = d[k];
  if (await download(`masterskaya-${app().ctx().today}.json`, JSON.stringify(out, null, 1), 'application/json')) toast('Копия сохранена');
};
changes['set.restore'] = async (v, el) => {
  const file = el.files[0]; el.value = '';
  if (!file) return;
  let b;
  try { b = JSON.parse(await file.text()); if (b.app !== 'author-writer') throw new Error(); } catch { toast('Это не копия мастерской'); return; }
  if (!(await ask('Заменить данные мастерской данными из файла?', 'Заменить'))) return;
  await app().store.replaceAll(Object.fromEntries(WCOLLS.map((k) => [k, b[k] || []])));
  toast('Данные восстановлены');
};
export { forms };
