// «Архив книг» (Настройки): ночные копии книг из программы Google — статус, копии по датам, открыть / скачать / восстановить.
import { esc, acts, openSheet, toast, ask, download } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { fmtDate, plural } from '../../../js/format.js';
import * as drive from '../drive.js';
import { INDEX_NAME, ARCHIVE_NAME, SCRIPT_V, scriptCode, archiveStatus, copiesWithDiff } from '../archive.js';

const app = () => window.__app;
const grp = (n) => String(Math.round(Number(n) || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
const arch = { index: undefined, loading: false, err: '' };
const docLink = (id) => `https://docs.google.com/document/d/${id}/edit`;
const fileLink = (id) => `https://drive.google.com/file/d/${id}/view`;
const ago = (days) => (days <= 0 ? 'сегодня' : days === 1 ? 'вчера' : `${days} ${plural(days, ['день', 'дня', 'дней'])} назад`);
const when = (iso) => { const d = new Date(iso), days = Math.floor((Date.now() - d.setHours(0, 0, 0, 0)) / 864e5); return `${ago(days)} в ${new Date(iso).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}`; };

// оглавление архива с Диска (раз в 12 часов само, или по кнопке «Обновить»); короткий статус — в общие настройки,
// чтобы предупреждение было видно и без открытия Настроек
export async function loadArchive(force = false, soft = false) {
  if (arch.loading || !drive.hasFreshToken()) return;
  if (arch.err && !force) return; // не повторяем по кругу — только по кнопке
  let last = 0;
  try { last = Number(localStorage.getItem('arch.at') || 0); } catch { /* ок */ }
  const fresh = Date.now() - last < 12 * 3600e3;
  if (!force && (soft ? fresh : arch.index !== undefined && fresh)) return;
  arch.loading = true; arch.err = '';
  try {
    arch.index = await drive.archiveIndex(INDEX_NAME);
    try { localStorage.setItem('arch.at', String(Date.now())); } catch { /* ок */ }
    const s = app().ctx().settings.archive || {}, ix = arch.index;
    if (ix && (s.lastRun !== ix.lastRun || s.ok !== !archiveStatus(ix).warn)) await app().store.saveSettings({ archive: { lastRun: ix.lastRun, ok: !(ix.errors || []).length && ix.github?.ok !== false } });
  } catch (e) { arch.err = 'Не получилось прочитать архив: ' + (e.message || String(e)); }
  arch.loading = false;
  app().rerender();
}

export function archiveCard(c) {
  const s = c.settings;
  const head = (badge = '') => `<div class="row between"><h2 style="margin:0">Архив книг</h2>${badge}</div>`;
  if (!drive.isConnected()) return `<div class="card arc">${head()}<p class="small muted">Подключите Google Диск — здесь появятся ночные копии книг.</p></div>`;
  const ix = arch.index;
  // доступ Google на час истёк или чтение не удалось — не «висим», а даём кнопку
  if (ix === undefined && (arch.err || !drive.hasFreshToken())) return `<div class="card arc">${head()}<p class="small muted">${arch.err ? esc(arch.err) : 'Чтобы показать архив, Google просит продлить доступ к Диску.'}</p><button class="primary" data-act="arc.open">Показать архив</button></div>`;
  if (ix === undefined) return `<div class="card arc">${head()}<p class="small muted">Загружаю…</p></div>`;
  if (!ix) {
    return `<div class="card arc">${head()}
      <p>Каждую ночь программа Google сама сохраняет копии всех книг и черновиков из папки с книгами в папку «${ARCHIVE_NAME}» на вашем Диске — компьютер для этого не нужен. Хранятся копии за каждый день месяца, дальше — по неделям и по месяцам.</p>
      <button class="primary" data-act="arc.setup">Настроить архив</button></div>`;
  }
  const st = archiveStatus(ix), books = Object.values(ix.books || {}).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'ru'));
  const line = st.days >= 2
    ? `<p class="arc-st warn">Архив не обновлялся ${st.days} ${plural(st.days, ['день', 'дня', 'дней'])}. Откройте программу «${ARCHIVE_NAME}» на script.google.com и нажмите Run — или напишите Claude.</p>`
    : `<p class="arc-st"><span class="dot good"></span>Архив проверен ${when(ix.lastRun)} · ${books.length} ${plural(books.length, ['книга', 'книги', 'книг'])}</p>`;
  const errs = (ix.errors || []).length ? `<p class="small arc-err">Не получилось: ${(ix.errors || []).slice(0, 3).map(esc).join('; ')}</p>` : '';
  const gh = ix.github ? (ix.github.ok ? `<p class="small muted">Копия вне Google (GitHub): ${esc(ix.github.msg || 'сохранено')} ${when(ix.github.at)}${ix.github.repo ? ` · <a class="link" href="https://github.com/${esc(String(ix.github.repo).replace(/^https?:\/\/github\.com\//i, '').replace(/\.git$/i, ''))}" target="_blank" rel="noopener">открыть</a>` : ''}</p>` : `<p class="small arc-err">GitHub: ${esc(ix.github.msg || 'ошибка')}</p>`) : '<p class="small muted">Копия вне Google (GitHub) не подключена — по желанию, в «Настроить».</p>';
  const rows = books.map((b) => {
    const cs = copiesWithDiff(b), last = cs[0];
    return `<a class="item row between" href="#" data-act="arc.book" data-id="${esc(b.id)}"><span><b class="arc-name">${esc(b.name)}</b><span class="sub">${[b.path ? esc(b.path) : '', `${cs.length} ${plural(cs.length, ['копия', 'копии', 'копий'])}`, last?.chars != null ? `${grp(last.chars)} зн.` : b.kind === 'docx' ? 'Word' : ''].filter(Boolean).join(' · ')}</span></span><span class="small muted">${last ? fmtDate(last.date).slice(0, 5) : ''}</span></a>`;
  }).join('');
  // программа у владелицы старее, чем в приложении — попросить заменить текст
  const upd = (ix.sv || 1) < SCRIPT_V ? `<div class="arc-st warn arc-upd"><span>Есть новая версия программы архива. Скопируйте её и замените текст на script.google.com (Ctrl+A, Ctrl+V, Ctrl+S), затем нажмите Run.</span><button class="small-btn" data-act="arc.copy">${ic('copy')} Скопировать программу</button></div>` : '';
  return `<div class="card arc">${head()}${line}${upd}${errs}
    <div class="list">${rows || '<p class="small muted">Копий пока нет — первая появится ночью.</p>'}</div>
    ${gh}
    <div class="dl-row"><a class="dl" href="https://drive.google.com/drive/folders/${esc(ix.folderId || '')}" target="_blank" rel="noopener">${ic('folder')}Папка архива</a><button class="dl" data-act="arc.reload">${ic('refresh')}Обновить</button><button class="dl" data-act="arc.setup">${ic('settings')}Настроить</button></div></div>`;
}

// предупреждение на Главной: архив давно не обновлялся
export function archiveWarn(c) {
  const a = c.settings.archive;
  if (!a?.lastRun) return '';
  const st = archiveStatus({ lastRun: a.lastRun });
  if (st.days < 2 && a.ok !== false) return '';
  return `<a class="card arc-warn" href="#" data-act="go" data-to="/settings">${ic('alert')}<span>${st.days >= 2 ? `Архив книг не обновлялся ${st.days} ${plural(st.days, ['день', 'дня', 'дней'])}` : 'В архиве книг ошибка'} — посмотрите в Настройках</span></a>`;
}

acts['arc.reload'] = () => { arch.index = undefined; loadArchive(true); };
// по нажатию можно открыть окно Google (без нажатия браузер его заблокирует)
acts['arc.open'] = async () => {
  try { await drive.ensureToken(); } catch (e) { arch.err = e.message || String(e); return; }
  arch.err = ''; arch.index = undefined; await loadArchive(true);
};

acts['arc.book'] = (d) => {
  const b = arch.index?.books?.[d.id];
  if (!b) return false;
  const cs = copiesWithDiff(b);
  openSheet(b.name, `<p class="small muted" style="margin-top:0">Копия делается в ночь после изменений. «Восстановить» создаёт новый документ рядом с оригиналом — сам оригинал не меняется.</p>
    <div class="list arc-copies">${cs.map((x, i) => `<div class="item"><div class="row between"><b>${fmtDate(x.date)}</b><span class="small">${x.chars != null ? `${grp(x.chars)} зн.` : ''}${x.diff ? ` <span class="${x.diff > 0 ? 'good' : 'muted'}">${x.diff > 0 ? '+' : '−'}${grp(Math.abs(x.diff))}</span>` : ''}</span></div>
      <div class="dl-row">${x.docId ? `<a class="dl" href="${docLink(x.docId)}" target="_blank" rel="noopener">${ic('eye')}Открыть</a>` : x.docxId ? `<a class="dl" href="${fileLink(x.docxId)}" target="_blank" rel="noopener">${ic('eye')}Открыть</a>` : ''}
      ${x.docxId ? `<button type="button" class="dl" data-act="arc.dl" data-id="${esc(b.id)}" data-i="${i}">${ic('download')}Word</button>` : ''}
      <button type="button" class="dl" data-act="arc.restore" data-id="${esc(b.id)}" data-i="${i}">${ic('refresh')}Восстановить</button></div></div>`).join('')}</div>`, null);
  return false;
};
acts['arc.dl'] = async (d) => {
  const b = arch.index.books[d.id], x = copiesWithDiff(b)[Number(d.i)];
  try { await drive.ensureToken(); const blob = await drive.fileBlob({ id: x.docxId, name: b.name, mimeType: drive.MIME.docx }); if (await download(`${b.name} ${x.date}.docx`, blob, drive.MIME.docx)) toast('Скачано'); } catch (e) { toast(e.message || String(e)); }
  return false;
};
acts['arc.restore'] = async (d) => {
  const b = arch.index.books[d.id], x = copiesWithDiff(b)[Number(d.i)];
  const name = `${b.name} (из архива ${fmtDate(x.date)})`;
  if (!(await ask(`Создать документ «${name}» рядом с оригиналом? Оригинал останется как есть.`, 'Восстановить'))) return false;
  try {
    await drive.ensureToken();
    let parent = arch.index.folderId;
    try { parent = (await drive.fileMeta(b.id))?.parents?.[0] || parent; } catch { /* оригинала нет — кладём в архив */ }
    await drive.copyFile(x.docId || x.docxId, name, parent);
    toast(`Готово: «${name}» — на Диске рядом с оригиналом`);
  } catch (e) { toast('Не получилось: ' + (e.message || e)); }
  return false;
};

// настройка: программа с уже подставленной папкой книг + шаги простыми словами
acts['arc.setup'] = () => {
  const s = app().ctx().settings;
  if (!s.wBooksFolder) { toast('Сначала выберите папку с книгами (блок «Google Диск» выше)'); return false; }
  openSheet('Настроить архив книг', `<ol class="arc-steps">
      <li>Нажмите <b>«Скопировать программу»</b> — в ней уже указана ваша папка «${esc(s.wBooksFolderName || 'с книгами')}».<div class="dl-row"><button type="button" class="primary" data-act="arc.copy">${ic('copy')} Скопировать программу</button></div></li>
      <li>Откройте <a href="https://script.google.com/home/projects/create" target="_blank" rel="noopener">script.google.com → новый проект</a> (тот же аккаунт Google, что и Диск).</li>
      <li>Сотрите всё в окне, вставьте программу (Ctrl+V), вверху переименуйте проект в «${ARCHIVE_NAME}» и нажмите <b>Ctrl+S</b> (или значок дискеты). Пока не сохранено, кнопка Run серая.</li>
      <li>Рядом с кнопкой <b>Run</b> («Выполнить») должно быть выбрано <b>setup</b> — нажмите <b>Run</b>. Появится окно разрешения: <b>Review permissions</b> → ваш аккаунт → <b>Advanced</b> («Дополнительно») → <b>Go to ${ARCHIVE_NAME} (unsafe)</b> → <b>Allow</b>. Google так предупреждает о любой личной программе — это нормально.</li>
      <li>Внизу откроется Execution log — подождите строку <b>Execution completed</b> (1–3 минуты).</li>
      <li>Готово. Первая копия появится через пару минут, дальше — каждую ночь около 3:00. Вернитесь сюда и нажмите «Обновить».</li></ol>
    <details class="arc-gh"><summary>Копия вне Google — GitHub, с историей правок (по желанию)</summary><ol class="arc-steps">
      <li>На <a href="https://github.com/new" target="_blank" rel="noopener">github.com/new</a>: имя <b>knigi-arhiv</b>, обязательно <b>Private</b>, галочка «Add a README» → «Create repository».</li>
      <li>Ключ: <a href="https://github.com/settings/personal-access-tokens/new" target="_blank" rel="noopener">github.com → новый ключ</a> → Repository access: «Only select repositories» → knigi-arhiv → Permissions → Contents: «Read and write» → «Generate token». Скопируйте ключ.</li>
      <li>В программе Google: шестерёнка «Настройки проекта» → «Свойства скрипта» → «Добавить»: <b>GITHUB_TOKEN</b> — ключ, <b>GITHUB_REPO</b> — <i>ваш_логин/knigi-arhiv</i> → «Сохранить».</li></ol>
      <p class="small muted">Ключ хранится только в вашей программе Google — ни в Мастерской, ни у Claude его нет. Каждую ночь тексты глав сохраняются туда с историей правок.</p></details>`, null);
  return false;
};
acts['arc.copy'] = async () => {
  const code = scriptCode(app().ctx().settings.wBooksFolder);
  try { await navigator.clipboard.writeText(code); toast('Программа скопирована — вставьте её на script.google.com'); } catch { if (await download('arhiv_masterskoy.gs.txt', new Blob([code], { type: 'text/plain' }), 'text/plain')) toast('Программа скачана файлом — откройте и скопируйте текст'); }
  return false;
};
