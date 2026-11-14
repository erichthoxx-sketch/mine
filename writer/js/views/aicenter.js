// Один центр подключения всей писательской системы к личному MCP.
// Все данные только на чтение для нейросети, отправка только по кнопке владелицы.
import { acts, ask, esc, toast, download } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { bookSnapshot, snapshotMarkdown } from '../bookai.js';
import { marketingSnapshot, incomeSnapshot, directSnapshot, readDirectDocs } from '../ai-system.js';
import { syncDirectAccess } from '../../../js/aidirect.js';
import * as drive from '../drive.js';
import { syncDriveAnalytics, AI_DRIVE_FILENAME } from '../ai-drive-report.js';

const app = () => window.__app;
const worker = () => String(app().ctx().settings.bookAiWorker || '').replace(/\/+$/, '');
const dateLabel = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  return isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
};
let running = false;

export function aiCenterCard(c) {
  const s = c.settings, ready = !!s.bookAiWorker, when = dateLabel(s.aiLastSyncedAt);
  const status = running ? 'Обновляю контекст…' : when
    ? (s.aiLastError ? 'Часть данных не обновилась' : 'Контекст передан')
    : (ready ? 'Готово к первому подключению' : 'Не настроено');
  return '<div class="card">' +
    '<div class="row between"><h2 style="margin:0">Нейросети</h2><span class="small muted">' + esc(status) + '</span></div>' +
    '<p class="small muted" style="margin:8px 0 12px">Один защищённый доступ к рукописям, маркетингу, продажам и статистике Яндекс.Директа. Нейросеть может читать данные, но не изменять их.</p>' +
    '<div class="row" style="gap:8px;flex-wrap:wrap">' +
    '<button class="primary" data-act="ai.all"' + (running ? ' disabled' : '') + '>' + ic('link') + (when ? 'Обновить весь контекст' : 'Подключить весь контекст') + '</button>' +
    '<button data-act="ai.export"' + (running ? ' disabled' : '') + '>' + ic('download') + 'Скачать для любой нейросети</button>' +
    '<button data-act="ai.drive"' + (running ? ' disabled' : '') + '>' + ic('refresh') + (s.aiDriveEnabled ? 'Обновить файл Google Drive' : 'Включить файл Google Drive') + '</button>' +
    (s.aiDriveEnabled ? '<button data-act="ai.drive.off"' + (running ? ' disabled' : '') + '>Остановить обновление Drive</button>' : '') +
    '<button data-act="bai.settings">Настроить</button>' +
    (when ? '<button class="link" data-act="ai.clear">Отключить всё</button>' : '') +
    '</div>' +
    (when ? '<p class="small muted" style="margin:10px 0 0">Рукописи: последняя ручная передача ' + esc(when) +
      (s.aiLastCount != null ? ' · Книг: ' + Number(s.aiLastCount) : '') +
      (s.aiLastError ? ' · ' + esc(s.aiLastError) : '') +
      (s.aiDirectLive === true ? ' · Директ — вживую, только чтение' : '') + '</p>' : '') +
    (s.aiDriveEnabled ? '<p class="small muted">Google Drive: последний снимок ' + esc(dateLabel(s.aiDriveAt) || 'не подтвержден') +
      (drive.hasFreshToken() ? ' · вход Google действует' : ' · вход Google истек, нужно обновить вручную') +
      '. Файл: ' + esc(AI_DRIVE_FILENAME) + '</p>' : '') +
    '<p class="hint">Аналитические снимки MCP обновляются при работе приложений после первого согласия. Рукописи по-прежнему обновляются только кнопкой «Обновить весь контекст». Для ChatGPT отдельный закрытый файл Google Drive обновляется автоматически, пока открытa Мастерская и действует вход Google (примерно час). Это не постоянный серверный доступ к Firebase; устаревшие даты надо проверять.</p>' +
    '</div>';
}
async function request(method, path, data) {
  const a = app(), user = a.store.auth?.currentUser;
  if (!user || !a.store.user?.uid || a.store.mode !== 'firebase') throw Error('Сначала войдите в Мастерскую');
  const token = await user.getIdToken();
  const res = await fetch(worker() + path, {
    method,
    headers: { Authorization: 'Bearer ' + token, ...(data ? { 'Content-Type': 'application/json' } : {}) },
    ...(data ? { body: JSON.stringify(data) } : {})
  });
  let out; try { out = await res.json(); } catch { throw Error('Cloudflare не ответил. Проверьте адрес Worker.'); }
  if (!res.ok || !out.ok) throw Error(out.error || 'Ошибка сервера (' + res.status + ')');
  return out;
}
async function checkWorker() {
  let res;
  try { res = await fetch(worker() + '/health', { cache: 'no-store' }); }
  catch { throw Error('Нет связи с Cloudflare Worker. Сначала разверните новый сервер.'); }
  if (!res.ok) throw Error('Worker не отвечает');
  const h = await res.json();
  if (!h.configured) throw Error('В Cloudflare ещё не настроены BOOKS, OWNER_UID или MCP_READ_KEY');
}
acts['ai.all'] = async () => {
  if (running) return false;
  if (!worker()) {
    acts['bai.settings']();
    toast('Сначала укажите адрес нового Worker в Cloudflare');
    return false;
  }
  if (!app().ctx().settings.aiConsentAt) {
    const ok = await ask('Передать в ваш закрытый Cloudflare копии всех рукописей, маркетинговых материалов, продаж и рекламной статистики? Данные будут доступны через личный ключ нейросети. Пароли и токены не передаются.', 'Передать контекст');
    if (!ok) return false;
  }
  running = true;
  app().rerender();
  const errors = [], store = app().store, data = app().ctx().data;
  let booksDone = 0, sectionsDone = 0;
  try {
    await checkWorker();
    // Финансы и маркетинг уже есть в общей базе «Мастерской»; Директ читаем свежим запросом Firebase.
    const sections = [
      ['marketing', marketingSnapshot(data)],
      ['income', incomeSnapshot(data)]
    ];
    try { sections.push(['direct', directSnapshot(await readDirectDocs(store), undefined, app().ctx().settings.direct?.metrika?.goals)]); }
    catch (e) { errors.push('Директ: ' + (e.message || e)); }
    for (const [name, snapshot] of sections) {
      try {
        await request('PUT', '/sync/section/' + name, snapshot);
        sectionsDone++;
      } catch (e) { errors.push(name + ': ' + (e.message || e)); }
    }
    const books = [...(app().ctx().wbooks || [])];
    if (!books.length) errors.push('В Мастерской пока нет книг');
    for (const book of books) {
      try {
        const b = await bookSnapshot(book);
        const res = await request('PUT', '/sync/' + encodeURIComponent(book.id), b);
        await store.patch('w_books', book.id, { aiShared: true, aiUpdatedAt: res.updatedAt });
        booksDone++;
      } catch (e) { errors.push(book.title + ': ' + (e.message || e)); }
    }
    // Директ вживую: нейросеть сама смотрит кампании (и черновики) когда нужно — только чтение.
    // Ключ Директа уходит в личный Cloudflare владелицы и нейросети не показывается.
    const st = app().ctx().settings;
    if (!st.directToken) errors.push('Директ вживую: нет входа в Директ — откройте «Директ» и войдите через Яндекс');
    else {
      try { if (await syncDirectAccess(store, { ...st, aiDirectLive: true })) await store.saveSettings({ aiDirectLive: true }); }
      catch (e) { errors.push('Директ вживую: ' + (e.message || e)); }
    }
    try { await request('POST', '/sync/prune', { ids: books.map((x) => x.id) }); }
    catch (e) { errors.push('Удаление старых книг: ' + (e.message || e)); }
    const now = new Date().toISOString();
    await store.saveSettings({
      aiLastSyncedAt: now, aiLastCount: booksDone, aiLastError: errors.join('; ').slice(0, 700),
      aiConsentAt: app().ctx().settings.aiConsentAt || now
    });
    toast(errors.length ? ('Передано ' + sectionsDone + ' раздела(ов), книг: ' + booksDone + '. Есть ошибки — см. статус.') :
      ('Готово: ' + booksDone + ' книг и ' + sectionsDone + ' раздела. MCP готов для совместимых нейросетей.'));
  } catch (e) {
    toast('Подключение не завершено: ' + (e.message || e));
  } finally {
    running = false;
    app().rerender();
  }
  return false;
};
acts['ai.clear'] = async () => {
  if (running) return false;
  if (!(await ask('Удалить все подключённые книги, маркетинг, доходы, данные и доступ к Директу из личного Cloudflare? Исходные данные в приложениях останутся.', 'Отключить всё'))) return false;
  if (!worker()) return false;
  running = true; app().rerender();
  const errors = [];
  try {
    await request('DELETE', '/sync/all');
    for (const b of app().ctx().wbooks || []) {
      try { await app().store.patch('w_books', b.id, { aiShared: false, aiUpdatedAt: '' }); }
      catch (e) { errors.push(b.title + ': ' + (e.message || e)); }
    }
    await app().store.saveSettings({
      aiLastSyncedAt: '', aiLastCount: 0, aiLastError: errors.join('; ').slice(0, 700), aiDirectLive: 'off'
    });
    toast(errors.length ? 'Облачные копии удалены, но не все метки книг обновились' : 'Все облачные копии контекста удалены');
  } catch (e) { toast('Не удалось отключить: ' + (e.message || e)); }
  finally { running = false; app().rerender(); }
  return false;
};


// Google Drive — только аналитика, никаких полных рукописей или API-ключей.
// Обновление по кнопке сначала продлевает OAuth (браузер разрешает popup лишь после клика).
acts['ai.drive'] = async () => {
  if (running) return false;
  try { await drive.ensureToken(); }
  catch (e) { toast('Google Drive: ' + (e.message || e)); return false; }
  running = true; app().rerender();
  try {
    const r = await syncDriveAnalytics(app().store, { force: true });
    if (r?.ok) toast('Аналитический файл Google Drive обновлён. Снимок: ' + dateLabel(r.at));
  } catch (e) {
    toast('Google Drive не обновлён: ' + (e.message || e));
  } finally { running = false; app().rerender(); }
  return false;
};
acts['ai.drive.off'] = async () => {
  if (running) return false;
  await app().store.saveSettings({ aiDriveEnabled: false });
  toast('Автообновление остановлено. Уже созданный файл остаётся в вашем Google Drive.');
  return false;
};

// Экспорт в единый Markdown, который можно вручную прикрепить к любому ИИ с поддержкой файлов.
// Данные собираются на устройстве и не передаются в новую облачную систему из этого действия.
acts['ai.export'] = async () => {
  if (running) return false;
  running = true;
  app().rerender();
  try {
    const a = app(), now = new Date().toISOString(), data = a.ctx().data;
    const sections = [
      '# Контекст авторской системы «Мастерская»',
      '',
      'Создано: ' + now,
      '',
      'В файле: книги, канон, написанные главы, маркетинг, доходы и сохранённая статистика Директа.',
      'Это снимок на указанную дату, а не актуальная онлайн-база. Отсутствующие сведения не выдумывать.',
      'Утверждённый канон и текст рукописи имеют приоритет над предположениями.',
      '',
      '# Маркетинг',
      '',
      '~~~json',
      JSON.stringify(marketingSnapshot(data, now), null, 2),
      '~~~',
      '',
      '# Доходы',
      '',
      '~~~json',
      JSON.stringify(incomeSnapshot(data, now), null, 2),
      '~~~'
    ];
    try {
      const direct = directSnapshot(await readDirectDocs(a.store), now, a.ctx().settings.direct?.metrika?.goals);
      sections.push('', '# Яндекс.Директ (сохранённая статистика)', '', '~~~json', JSON.stringify(direct, null, 2), '~~~');
    } catch (e) {
      sections.push('', '# Яндекс.Директ', '', 'Статистика недоступна: ' + String(e.message || e).slice(0, 300));
    }
    const skipped = [];
    for (const book of [...a.ctx().wbooks]) {
      try {
        const snapshot = await bookSnapshot(book);
        sections.push('', '# Роман: ' + snapshot.title, '',
          'Обновлено: ' + snapshot.generatedAt, '', snapshotMarkdown(snapshot));
      } catch (e) {
        skipped.push(book.title + ': ' + String(e.message || e).slice(0, 200));
      }
    }
    if (skipped.length) sections.splice(8, 0, '', 'Не удалось прочитать: ' + skipped.join('; '));
    const file = new Blob([sections.join('\n')], { type: 'text/markdown;charset=utf-8' });
    if (await download('masterskaya_ai_full_context.md', file, 'text/markdown')) {
      toast(skipped.length
        ? 'Контекст сохранён с пропусками: ' + skipped.length + ' книг. Проверьте начало файла.'
        : 'Контекст сохранён. Прикрепите .md к чату или проекту нужной нейросети.');
    }
  } catch (e) {
    toast('Не удалось собрать единый файл: ' + (e.message || e));
  } finally {
    running = false;
    app().rerender();
  }
  return false;
};
