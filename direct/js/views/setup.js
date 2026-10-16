// «Настройка шаг за шагом»: подключение Директа простыми шагами. Галочки ставятся сами, где это можно проверить.
import { esc, acts, forms, toast } from '../../../js/ui.js';
import { ic } from '../../../js/icons.js';
import { authorizeUrl } from '../api.js';
import { demo } from '../demo.js';

const app = () => window.__app;
const saveD = (patch) => app().store.saveSettings({ direct: { ...(app().ctx().settings.direct || {}), ...patch } });
const copyBtn = (text, label = 'Скопировать') => `<button type="button" class="dl" data-act="st.copy" data-v="${esc(text)}">${ic('copy')} ${label}</button>`;
const ext = (url, label) => `<a href="${url}" target="_blank" rel="noopener">${label}</a>`;

export function setupSteps(c) {
  const s = c.settings, d = s.direct || {}, real = !demo.on && !!app().snap('main');
  const err = d.lastError;
  return [
    {
      id: 'proxy', title: 'Переходник на Cloudflare', time: '10 минут', done: !!d.proxyOk,
      why: 'Яндекс не пускает сайты напрямую в Директ. Переходник — ваш личный бесплатный посредник: передаёт запросы приложения в Директ и обратно, ничего не хранит.',
      how: [
        `Откройте ${ext('https://dash.cloudflare.com/sign-up', 'регистрацию Cloudflare')}: почта и пароль, потом подтвердите почту по письму. Карта не нужна.`,
        'Слева <b>Compute → Workers & Pages</b> → синяя кнопка справа <b>Create application</b> → <b>Start with Hello World!</b>',
        'Имя — <b>direct</b> → <b>Deploy</b>.',
        `Нажмите <b>Edit code</b>, удалите всё в окне. Нажмите здесь <button type="button" class="dl" data-act="st.worker">${ic('copy')} Скопировать код переходника</button> и вставьте туда → <b>Deploy</b>.`,
        'Вверху появится адрес вида <b>https://direct.что-то.workers.dev</b> — скопируйте его и вставьте сюда:',
      ],
      form: `<form data-form="st.proxy" class="row st-form"><input name="v" value="${esc(d.proxy || '')}" placeholder="https://direct.….workers.dev" inputmode="url" required><button class="primary" type="submit">Проверить</button></form>
        ${d.proxy && !d.proxyOk ? '<p class="small down">Переходник не ответил. Проверьте адрес (без лишних пробелов) и что после вставки кода нажали Deploy.</p>' : ''}`,
    },
    {
      id: 'app', title: 'Приложение Яндекса', time: '5 минут', done: !!d.clientId,
      why: 'Это «пропуск»: через него Яндекс разрешит приложению «Директ» видеть и менять ваши кампании. Пароль от Яндекса приложение не узнает.',
      how: [
        `Откройте ${ext('https://oauth.yandex.ru/client/new', 'oauth.yandex.ru/client/new')} — в том аккаунте Яндекса, где ваш Директ.`,
        'Выберите <b>«Для доступа к API или отладки»</b> → <b>«Перейти к созданию»</b>.',
        'Название сервиса — <b>Директ Ланы</b> (любое). Почта — любая ваша.',
        'В поле <b>«Название доступа»</b> напечатайте <b>директ</b> и выберите <b>«Использование API Яндекс Директа»</b>.',
        'Поле Redirect URI заполнено само — не трогайте. Нажмите <b>«Создать приложение»</b>.',
        'Появится <b>ClientID</b> (длинная строка из букв и цифр). Скопируйте его сюда:',
      ],
      form: `<form data-form="st.client" class="row st-form"><input name="v" value="${esc(d.clientId || '')}" placeholder="ClientID" autocomplete="off" required><button class="primary" type="submit">Сохранить</button></form>`,
    },
    {
      id: 'apply', title: 'Заявка на доступ к API Директа', time: '10 минут + ожидание', done: !!d.appliedAt || real,
      why: 'Яндекс один раз проверяет, кто будет управлять кампаниями через API. Обычно отвечает за несколько дней — письмом на почту.',
      how: [
        `Откройте ${ext('https://direct.yandex.ru/', 'кабинет Директа')} и найдите раздел <b>API</b> (обычно в меню настроек или «Инструменты»; если не видно — в справке Директа поиск «заявка на доступ к API»).`,
        'Примите условия и создайте <b>новую заявку</b>.',
        `Укажите ваш ClientID: ${d.clientId ? `<code class="d-code">${esc(d.clientId)}</code> ${copyBtn(d.clientId)}` : '<span class="muted">сначала шаг 2</span>'}`,
        'Цель — <b>«Управление собственными рекламными кампаниями»</b>, доступ для себя (не агентство). Отправьте.',
        'Пока ждёте ответа — учитесь на примере: вкладка «Курс».',
      ],
      form: d.appliedAt ? `<p class="small muted">Отмечено: заявка подана ${new Date(d.appliedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}.</p>` : '<div class="row"><button class="primary" data-act="st.applied">Я подала заявку</button></div>',
    },
    {
      id: 'login', title: 'Вход через Яндекс', time: '1 минута', done: !!s.directToken && !(err?.code === 53),
      why: 'Яндекс спросит: «Разрешить приложению доступ к Директу?» — нажмите «Разрешить». После этого приложение само загрузит кампании.',
      how: ['Нажмите «Войти через Яндекс» — откроется новая вкладка. Нажмите там «Разрешить».', 'Яндекс покажет длинный ключ (токен). Скопируйте его, вернитесь сюда и вставьте в поле ниже → «Сохранить».'],
      form: `<div class="row"><button class="primary" data-act="st.login"${d.clientId && d.proxyOk ? '' : ' disabled'}>Войти через Яндекс</button></div>
        <form data-form="st.token" class="row st-form"><input name="v" type="password" autocomplete="off" placeholder="Ключ со страницы Яндекса" required><button type="submit">Сохранить</button></form>
        ${!(d.clientId && d.proxyOk) ? '<p class="small muted">Кнопка заработает после шагов 1 и 2.</p>' : ''}
        ${err ? `<p class="small down">${esc(err.code === 58 ? 'Яндекс ещё не одобрил заявку на API. Как придёт письмо — нажмите ↻ «Обновить» вверху.' : err.code === 53 ? 'Ключ устарел — войдите заново.' : err.text)}</p>` : ''}`,
    },
    {
      id: 'limit', title: 'Лимит бюджета в кабинете', time: '3 минуты', done: !!d.limitSet,
      why: 'Главный предохранитель: Директ не потратит больше лимита, что бы ни случилось. Приложение бюджет не меняет — это делаете только вы.',
      how: [
        'В кабинете Директа откройте кампанию → редактирование → блок <b>«Стратегия»</b> / <b>«Бюджет»</b>.',
        'Для теста на 10 000 ₽ за 2 недели удобно поставить <b>недельный бюджет 5 000 ₽</b> (или дневной лимит ≈ 700 ₽).',
        'Сохраните кампанию.',
      ],
      form: d.limitSet ? '<p class="small muted">Отмечено: лимит стоит.</p>' : '<div class="row"><button class="primary" data-act="st.limit">Лимит поставила</button></div>',
    },
    {
      id: 'link', title: 'Связать кампанию с «Доходами»', time: '1 минута', done: Object.values(d.links || {}).some(Boolean),
      why: 'Директ не видит продаж. Когда кампания связана, расход сам уходит в «Доходы», и там видно, окупается ли реклама.',
      how: ['Откройте кампанию на Обзоре → строка «В «Доходах»» → выберите «+ Создать там кампанию».'],
      form: real ? `<div class="row"><button class="primary" data-act="go" data-to="/c/${app().snap('main').campaigns[0]?.id || ''}">Открыть кампанию</button></div>` : '<p class="small muted">Станет доступно после входа.</p>',
    },
  ];
}

export function setupCard(c, { title = 'Настройка шаг за шагом' } = {}) {
  const steps = setupSteps(c), done = steps.filter((x) => x.done).length, cur = steps.findIndex((x) => !x.done);
  return `<div class="card"><div class="row between"><h2 style="margin:0">${title}</h2><span class="small muted">готово ${done} из ${steps.length}</span></div>
    <div class="progress ${done === steps.length ? 'ok' : ''}"><i style="width:${(done / steps.length * 100).toFixed(1)}%"></i></div>
    ${done === steps.length ? '<p class="up">Всё подключено. Дальше — вкладка «Сейчас»: что делать на этом этапе теста.</p>' : ''}
    <div class="st-steps">${steps.map((x, i) => `<details class="st-step ${x.done ? 'done' : ''}"${i === cur ? ' open' : ''}><summary><span class="st-n">${x.done ? ic('check') : i + 1}</span><b>${x.title}</b><span class="small muted"> · ${x.time}</span></summary>
      <p class="small">${x.why}</p><ol class="small st-how">${x.how.map((h) => `<li>${h}</li>`).join('')}</ol>${x.form}</details>`).join('')}</div>
    <p class="small muted">Застряли — пришлите скриншот в чат с ИИ и напишите номер шага.</p></div>`;
}

acts['st.copy'] = async (d) => { try { await navigator.clipboard.writeText(d.v); toast('Скопировано'); } catch { toast('Не получилось скопировать — выделите и скопируйте вручную'); } return false; };
acts['st.worker'] = async () => {
  let code = '';
  for (const u of ['direct-worker.js', '../proxy/direct-worker.js']) { try { const r = await fetch(u, { cache: 'no-store' }); if (r.ok) { code = await r.text(); break; } } catch { /* следующий адрес */ } }
  if (!code) { toast('Не получилось загрузить код — обновите страницу'); return false; }
  try { await navigator.clipboard.writeText(code); toast('Код скопирован — вставьте его в Cloudflare'); } catch { toast('Не получилось скопировать'); }
  return false;
};
forms['st.proxy'] = async (fd) => {
  const v = fd.get('v').trim().replace(/\/+$/, '');
  if (!/^https:\/\/[^\s]+$/.test(v)) { toast('Адрес начинается с https:// и без пробелов'); return; }
  let ok = false;
  try { const r = await fetch(v + '/ping', { cache: 'no-store' }); ok = r.ok && (await r.text()).trim() === 'ok'; } catch { /* не ответил */ }
  await saveD({ proxy: v, proxyOk: ok });
  toast(ok ? 'Переходник работает ✓' : 'Переходник не ответил');
};
forms['st.client'] = async (fd) => { await saveD({ clientId: fd.get('v').trim() }); toast('ClientID сохранён'); };
acts['st.applied'] = () => saveD({ appliedAt: new Date().toISOString() });
acts['st.limit'] = () => saveD({ limitSet: true });
acts['st.login'] = () => { window.open(authorizeUrl(app().ctx().settings.direct.clientId), '_blank', 'noopener'); return false; };
forms['st.token'] = async (fd) => {
  const t = fd.get('v').trim();
  if (t.length < 20) { toast('Это не похоже на ключ — скопируйте его целиком'); return; }
  await app().store.saveSettings({ directToken: t, directTokenExp: Date.now() + 180 * 86400000 });
  app().ui.demo = false; toast('Ключ сохранён — загружаю кампании'); app().reload?.({ quiet: true });
};
