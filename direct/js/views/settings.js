// Настройки: подключение (переходник → приложение Яндекса → вход), предохранители, тестовый бюджет
import { esc, acts, forms, toast, ask, N } from '../../../js/ui.js';
import { rub } from '../../../js/format.js';
import { authorizeUrl, redirectUri } from '../api.js';
import { DEFAULT_MAX_BID, DEFAULT_TEST_BUDGET } from '../dcalc.js';

const app = () => window.__app;
const HELP = 'https://github.com/erichthoxx-sketch/mine/blob/claude/author-income-ads-tracker-3zjbxd/docs/SETUP-DIRECT.md';
const saveD = (patch) => app().store.saveSettings({ direct: { ...(app().ctx().settings.direct || {}), ...patch } });
const dot = (ok, t) => `<span class="d-st ${ok ? 'good' : ''}">● ${t}</span>`;

export function settingsView(a) {
  const s = a.ctx().settings, d = s.direct || {}, on = !!s.directToken;
  const exp = s.directTokenExp ? new Date(s.directTokenExp) : null;
  const left = exp ? Math.round((exp - Date.now()) / 86400000) : null;
  return {
    html: `<div class="card"><div class="row between"><h2 style="margin:0">Подключение</h2>${on ? dot(true, 'подключён') : dot(false, 'не подключён')}</div>
      <p class="small muted">Три шага, один раз. Подробная инструкция с картинками-подсказками — <a href="${HELP}" target="_blank" rel="noopener">здесь</a>.</p>
      <form data-form="d.conn" class="settings-form">
        <h3>1. Переходник</h3>
        <p class="small">Яндекс не пускает браузерные приложения в Директ напрямую, поэтому нужен свой маленький бесплатный переходник на Cloudflare (он только передаёт запросы и ничего не хранит).</p>
        <label>Адрес переходника</label><input name="proxy" value="${esc(d.proxy || '')}" placeholder="https://direct.ваше-имя.workers.dev" inputmode="url">
        <h3>2. Приложение Яндекса</h3>
        <p class="small">На oauth.yandex.ru → «Создать приложение» → «Веб-сервисы». В поле Redirect URI вставьте:<br><code class="d-code">${esc(redirectUri())}</code><br>Доступ: «Яндекс Директ — использование API». Скопируйте ClientID сюда — и с ним же подайте заявку на API в кабинете Директа.</p>
        <label>ClientID</label><input name="clientId" value="${esc(d.clientId || '')}" autocomplete="off">
        <div class="row"><button type="submit">Сохранить</button></div>
      </form>
      <h3>3. Вход</h3>
      ${on ? `<p class="small">Ключ Яндекса сохранён${left != null ? `, действует ещё ${left} дн.` : ''}. ${left != null && left < 14 ? '<b>Скоро истечёт — войдите заново.</b>' : ''}</p>` : ''}
      <div class="row"><button class="primary" data-act="d.login"${d.clientId && d.proxy ? '' : ' disabled'}>${on ? 'Войти заново' : 'Войти через Яндекс'}</button>${on ? '<button class="link danger" data-act="d.off">Отключить</button>' : ''}</div>
      <details><summary class="small">Вставить ключ вручную</summary><form data-form="d.token"><input name="t" type="password" autocomplete="off" placeholder="OAuth-токен Яндекса"><div class="row"><button type="submit">Сохранить ключ</button></div></form></details></div>
    <div class="card"><h2>Тест и предохранители</h2>
      <form data-form="d.opts" class="settings-form">
        <div class="f2"><div><label>Тестовый бюджет, ₽</label><input name="testBudget" inputmode="decimal" value="${esc(d.testBudget ?? DEFAULT_TEST_BUDGET)}"></div><div><label>Тест с даты</label><input type="date" name="testFrom" value="${esc(d.testFrom || '')}"></div></div>
        <label>Предел ставки за клик, ₽</label><input name="maxBid" inputmode="decimal" value="${esc(d.maxBid ?? DEFAULT_MAX_BID)}">
        <p class="hint">Дороже приложение (и ИИ через него) ставку не поставит. Бюджет и дневной лимит меняются только в кабинете Директа.</p>
        <label class="row"><input type="checkbox" name="sandbox" ${d.sandbox ? 'checked' : ''}> Песочница Директа (тренировка без денег)</label>
        <details><summary class="small">Для агентского аккаунта</summary><label>Логин клиента (Client-Login)</label><input name="clientLogin" value="${esc(d.clientLogin || '')}"></details>
        <div class="row"><button class="primary" type="submit">Сохранить</button></div>
      </form>
      <p class="small muted">Сейчас: тест ${rub(Number(d.testBudget) || DEFAULT_TEST_BUDGET, 0)}, ставка не выше ${rub(Number(d.maxBid) || DEFAULT_MAX_BID, 0)}${d.sandbox ? ', песочница' : ''}.</p></div>`,
  };
}
forms['d.conn'] = async (fd) => {
  const proxy = fd.get('proxy').trim().replace(/\/+$/, '');
  if (proxy && !/^https:\/\//.test(proxy)) { toast('Адрес переходника начинается с https://'); return; }
  await saveD({ proxy, clientId: fd.get('clientId').trim() });
  toast('Сохранено');
};
forms['d.opts'] = async (fd) => {
  const tb = N(fd.get('testBudget')), mb = N(fd.get('maxBid'));
  await saveD({ testBudget: tb > 0 ? tb : DEFAULT_TEST_BUDGET, testFrom: fd.get('testFrom') || '', maxBid: mb > 0 ? mb : DEFAULT_MAX_BID, sandbox: fd.get('sandbox') === 'on', clientLogin: (fd.get('clientLogin') || '').trim() });
  toast('Сохранено');
};
forms['d.token'] = async (fd) => {
  const t = fd.get('t').trim();
  if (t.length < 20) { toast('Это не похоже на ключ'); return; }
  await app().store.saveSettings({ directToken: t, directTokenExp: null });
  app().ui.demo = false; toast('Ключ сохранён'); app().reload?.({ quiet: true });
};
acts['d.login'] = () => { location.href = authorizeUrl(app().ctx().settings.direct.clientId); return false; };
acts['d.off'] = async () => {
  if (!(await ask('Отключить Директ? Кампании в Директе продолжат работать, просто приложение перестанет их видеть.', 'Отключить'))) return;
  await app().store.saveSettings({ directToken: '', directTokenExp: null });
  toast('Директ отключён');
};
